import json
from datetime import timedelta
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile

from core.test_utils import make_owner, make_team_member, auth_client
from team.models import PERMISSION_CATALOG, DEFAULT_PERMISSIONS
from products.models import Product, Category
from orders.models import Order
from .models import AIConversation, AIMessage, AIPendingAction, AIProductDraft
from . import ollama_client
from . import tools as ai_tools
from . import vision_client
from .chat_loop import run_chat_loop
from .serializers import AIMessageSerializer
from audit.models import AuditLog


class AIAssistantModelsTest(TestCase):
    def test_permission_registered(self):
        keys = [k for k, _ in PERMISSION_CATALOG]
        self.assertIn('ai_assistant_view', keys)
        self.assertFalse(DEFAULT_PERMISSIONS['confirmateur']['ai_assistant_view'])
        self.assertFalse(DEFAULT_PERMISSIONS['dropshipper']['ai_assistant_view'])

    def test_create_conversation_and_message(self):
        owner, store = make_owner()
        conv = AIConversation.objects.create(store=store, user=owner, title='Test')
        msg = AIMessage.objects.create(conversation=conv, role='user', content='Bonjour')
        self.assertEqual(conv.messages.count(), 1)
        self.assertEqual(msg.role, 'user')

    def test_conversation_requires_user_xor_session(self):
        from django.db import IntegrityError, transaction
        owner, store = make_owner()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AIConversation.objects.create(store=store)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AIConversation.objects.create(store=store, user=owner, session_id='abc123')
        conv = AIConversation.objects.create(store=store, session_id='abc123')
        self.assertIsNone(conv.user)


@override_settings(AI_PROVIDER='ollama')
class OllamaClientTest(TestCase):
    @patch('ai_assistant.ollama_client.requests.post')
    def test_generate_returns_text(self, mock_post):
        mock_post.return_value = MagicMock(status_code=200, json=lambda: {'response': 'Bonjour le monde'})
        result = ollama_client.generate('Dis bonjour')
        self.assertEqual(result, 'Bonjour le monde')

    @patch('ai_assistant.ollama_client.requests.post')
    def test_chat_returns_message_dict(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {'message': {'role': 'assistant', 'content': 'Salut'}},
        )
        result = ollama_client.chat([{'role': 'user', 'content': 'Salut'}])
        self.assertEqual(result['content'], 'Salut')

    @patch('ai_assistant.ollama_client.requests.post')
    def test_connection_error_raises_unavailable(self, mock_post):
        import requests
        mock_post.side_effect = requests.exceptions.ConnectionError('refused')
        with self.assertRaises(ollama_client.OllamaUnavailableError):
            ollama_client.generate('test')

    @patch('ai_assistant.ollama_client.requests.post')
    def test_timeout_raises_unavailable(self, mock_post):
        import requests
        mock_post.side_effect = requests.exceptions.Timeout('too slow')
        with self.assertRaises(ollama_client.OllamaUnavailableError):
            ollama_client.chat([{'role': 'user', 'content': 'x'}])


class GroqClientTest(TestCase):
    """AI_PROVIDER='groq' — même contrat public (chat()/generate()/
    OllamaUnavailableError) que le chemin Ollama, endpoint et payload
    différents (API compatible OpenAI)."""

    @override_settings(AI_PROVIDER='groq', GROQ_API_KEY='test-key', GROQ_MODEL='llama-3.1-8b-instant')
    @patch('ai_assistant.ollama_client.requests.post')
    def test_generate_returns_text(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {'choices': [{'message': {'content': 'Bonjour le monde'}}]},
        )
        result = ollama_client.generate('Dis bonjour')
        self.assertEqual(result, 'Bonjour le monde')
        called_url = mock_post.call_args[0][0]
        self.assertEqual(called_url, ollama_client.GROQ_API_URL)
        self.assertEqual(mock_post.call_args.kwargs['headers']['Authorization'], 'Bearer test-key')

    @override_settings(AI_PROVIDER='groq', GROQ_API_KEY='test-key', GROQ_MODEL='llama-3.1-8b-instant')
    @patch('ai_assistant.ollama_client.requests.post')
    def test_chat_normalizes_tool_call_arguments_from_json_string(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {'choices': [{'message': {
                'role': 'assistant', 'content': '',
                'tool_calls': [{'function': {'name': 'get_low_stock', 'arguments': '{}'}}],
            }}]},
        )
        result = ollama_client.chat([{'role': 'user', 'content': 'stock ?'}], tools=[{'type': 'function'}])
        self.assertEqual(result['tool_calls'][0]['function']['arguments'], {})

    @override_settings(AI_PROVIDER='groq', GROQ_API_KEY='test-key')
    @patch('ai_assistant.ollama_client.requests.post')
    def test_error_status_raises_unavailable(self, mock_post):
        mock_post.return_value = MagicMock(status_code=401, text='invalid api key')
        with self.assertRaises(ollama_client.OllamaUnavailableError):
            ollama_client.generate('test')

    @override_settings(AI_PROVIDER='groq', GROQ_API_KEY='test-key')
    @patch('ai_assistant.ollama_client.requests.post')
    def test_connection_error_raises_unavailable(self, mock_post):
        import requests
        mock_post.side_effect = requests.exceptions.ConnectionError('refused')
        with self.assertRaises(ollama_client.OllamaUnavailableError):
            ollama_client.chat([{'role': 'user', 'content': 'x'}])


class GenerateProductViewTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.client_ = auth_client(self.owner)

    @patch('ai_assistant.views.ollama_client.generate')
    def test_generates_product_fields(self, mock_generate):
        mock_generate.return_value = json.dumps({
            'description': '<p>Une belle chaise en bois.</p>',
            'meta_title': 'Chaise en bois — Boutique',
            'meta_description': 'Découvrez notre chaise en bois artisanale.',
            'meta_keywords': 'chaise, bois, mobilier',
        })
        resp = self.client_.post('/api/ai/generate-product/', {'name': 'Chaise en bois', 'keywords': 'artisanal'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('chaise en bois', resp.data['description'])

    @patch('ai_assistant.views.ollama_client.generate')
    def test_ollama_down_returns_503(self, mock_generate):
        from ai_assistant.ollama_client import OllamaUnavailableError
        mock_generate.side_effect = OllamaUnavailableError('down')
        resp = self.client_.post('/api/ai/generate-product/', {'name': 'Chaise'}, format='json')
        self.assertEqual(resp.status_code, 503)

    def test_confirmateur_without_permission_forbidden(self):
        member_user, member = make_team_member(self.store, role='confirmateur')
        client_ = auth_client(member_user)
        resp = client_.post('/api/ai/generate-product/', {'name': 'Chaise'}, format='json')
        self.assertEqual(resp.status_code, 403)


class SuggestReplyViewTest(TestCase):
    def setUp(self):
        from inbox.models import Conversation, Message
        self.owner, self.store = make_owner()
        self.client_ = auth_client(self.owner)
        self.conv = Conversation.objects.create(
            store=self.store, channel='complaint', subject='Problème livraison',
            customer_name='Amine', customer_phone='0555000000',
        )
        Message.objects.create(conversation=self.conv, direction='inbound', body='Ma commande est en retard')

    @patch('ai_assistant.views.ollama_client.generate')
    def test_suggests_reply(self, mock_generate):
        mock_generate.return_value = "Bonjour Amine, nous vérifions votre commande et revenons vers vous rapidement."
        resp = self.client_.post(f'/api/ai/inbox/{self.conv.id}/suggest-reply/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('Amine', resp.data['suggestion'])

    def test_wrong_conversation_404(self):
        resp = self.client_.post('/api/ai/inbox/999999/suggest-reply/')
        self.assertEqual(resp.status_code, 404)


class DashboardSummaryViewTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.client_ = auth_client(self.owner)

    @patch('ai_assistant.views.ollama_client.generate')
    def test_deliveries_summary(self, mock_generate):
        mock_generate.return_value = "Sur la période, 12 commandes ont été passées, dont 8 confirmées."
        resp = self.client_.get('/api/ai/dashboard-summary/?tab=deliveries&period=week')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('commandes', resp.data['summary'])

    def test_invalid_tab_400(self):
        resp = self.client_.get('/api/ai/dashboard-summary/?tab=inexistant')
        self.assertEqual(resp.status_code, 400)


class ToolsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        from products.models import Product
        Product.objects.create(store=self.store, name='Produit test', price=1000, stock=2)

    def test_owner_can_get_low_stock(self):
        from rest_framework.test import APIRequestFactory
        factory = APIRequestFactory()
        req = factory.get('/api/ai/chat/')
        req.user = self.owner
        result = ai_tools.execute_tool(req, 'get_low_stock', {})
        self.assertIn('Produit test', result)

    def test_get_low_stock_uses_variant_total_not_product_stock_field(self):
        """Product.stock reste à 0 pour un produit à variantes (le vrai
        stock vit sur VariantOption) — un produit avec 7 en stock réparti
        sur ses variantes ne doit jamais apparaître comme "0 en stock"."""
        from rest_framework.test import APIRequestFactory
        from products.models import Product, ProductVariant, VariantOption
        product = Product.objects.create(store=self.store, name='Chaussure', price=5000, stock=0)
        variant = ProductVariant.objects.create(product=product, name='Pointure')
        VariantOption.objects.create(variant=variant, value='40', stock=4)
        VariantOption.objects.create(variant=variant, value='41', stock=3)
        factory = APIRequestFactory()
        req = factory.get('/api/ai/chat/')
        req.user = self.owner
        result = ai_tools.execute_tool(req, 'get_low_stock', {})
        self.assertNotIn('Chaussure', result)

    def test_get_inventory_uses_variant_total(self):
        from rest_framework.test import APIRequestFactory
        from products.models import Product, ProductVariant, VariantOption
        product = Product.objects.create(store=self.store, name='Chaussure', price=5000, stock=0)
        variant = ProductVariant.objects.create(product=product, name='Pointure')
        VariantOption.objects.create(variant=variant, value='40', stock=4)
        VariantOption.objects.create(variant=variant, value='41', stock=3)
        factory = APIRequestFactory()
        req = factory.get('/api/ai/chat/')
        req.user = self.owner
        result = ai_tools.execute_tool(req, 'get_inventory', {})
        self.assertIn('"stock": 7', result)

    def test_get_inventory_search_filter(self):
        from rest_framework.test import APIRequestFactory
        factory = APIRequestFactory()
        req = factory.get('/api/ai/chat/')
        req.user = self.owner
        result = ai_tools.execute_tool(req, 'get_inventory', {'search': 'inexistant'})
        self.assertIn('"count": 0', result)

    def test_confirmateur_without_stock_view_refused(self):
        from rest_framework.test import APIRequestFactory
        member_user, member = make_team_member(self.store, role='confirmateur')
        factory = APIRequestFactory()
        req = factory.get('/api/ai/chat/')
        req.user = member_user
        result = ai_tools.execute_tool(req, 'get_low_stock', {})
        self.assertIn("n'avez pas la permission", result)


class ExtendedToolsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def _req(self, user):
        from rest_framework.test import APIRequestFactory
        factory = APIRequestFactory()
        req = factory.get('/api/ai/chat/')
        req.user = user
        return req

    def test_get_inventory_includes_price_and_active_status(self):
        from products.models import Product
        Product.objects.create(store=self.store, name='Complet', price=1000, stock=5, is_active=True)
        result = json.loads(ai_tools.execute_tool(self._req(self.owner), 'get_inventory', {}))
        row = result['products'][0]
        self.assertEqual(row['price'], 1000.0)
        self.assertTrue(row['is_active'])

    def test_get_incomplete_products_requires_permission(self):
        member_user, _ = make_team_member(self.store, role='confirmateur')
        result = ai_tools.execute_tool(self._req(member_user), 'get_incomplete_products', {})
        self.assertIn("n'avez pas la permission", result)

    def test_get_incomplete_products_lists_missing_fields(self):
        from products.models import Product
        Product.objects.create(store=self.store, name='Incomplet', price=1000, stock=5, is_active=True)
        result = json.loads(ai_tools.execute_tool(self._req(self.owner), 'get_incomplete_products', {}))
        self.assertEqual(result['active_products'], 1)
        self.assertIn('Incomplet', result['missing_image'])

    def test_get_team_summary_requires_permission(self):
        member_user, _ = make_team_member(self.store, role='confirmateur')
        result = ai_tools.execute_tool(self._req(member_user), 'get_team_summary', {})
        self.assertIn("n'avez pas la permission", result)

    def test_get_team_summary_lists_active_members(self):
        make_team_member(self.store, role='confirmateur')
        result = json.loads(ai_tools.execute_tool(self._req(self.owner), 'get_team_summary', {}))
        self.assertEqual(len(result['members']), 1)

    def test_get_confirmateur_performance_by_name(self):
        member_user, member = make_team_member(self.store, role='confirmateur')
        result = json.loads(ai_tools.execute_tool(self._req(self.owner), 'get_confirmateur_performance', {'name': member.first_name}))
        self.assertEqual(result['member_id'], member.id)

    def test_get_confirmateur_performance_unknown_name(self):
        result = ai_tools.execute_tool(self._req(self.owner), 'get_confirmateur_performance', {'name': 'Inconnu'})
        self.assertIn('introuvable', result.lower())


class MoreExtendedToolsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def _req(self, user):
        from rest_framework.test import APIRequestFactory
        factory = APIRequestFactory()
        req = factory.get('/api/ai/chat/')
        req.user = user
        return req

    def test_get_returns_summary_requires_permission(self):
        member_user, _ = make_team_member(self.store, role='confirmateur')
        result = ai_tools.execute_tool(self._req(member_user), 'get_returns_summary', {})
        self.assertIn("n'avez pas la permission", result)

    def test_get_returns_summary_returns_rate(self):
        result = json.loads(ai_tools.execute_tool(self._req(self.owner), 'get_returns_summary', {}))
        self.assertIn('return_rate', result)

    def test_get_pending_exchanges_lists_open_only(self):
        from orders.models import Order, OrderItem, ExchangeRequest
        from products.models import Product, ProductVariant, VariantOption
        product = Product.objects.create(store=self.store, name='Chaussure', price=1000, is_active=True)
        variant = ProductVariant.objects.create(product=product, name='Taille')
        opt_a = VariantOption.objects.create(variant=variant, value='40', stock=5)
        opt_b = VariantOption.objects.create(variant=variant, value='41', stock=5)
        order = Order.objects.create(store=self.store, first_name='C', last_name='L', phone='0555000000',
                                      wilaya='Alger', commune='Alger Centre', address='Adr', status='delivered',
                                      subtotal=1000, shipping_cost=0, total=1000)
        item = OrderItem.objects.create(order=order, product=product, variant_option=opt_a, product_name='Chaussure', price=1000, quantity=1)
        ExchangeRequest.objects.create(store=self.store, order_item=item, replacement_option=opt_b, reason='Trop petit', status='open')
        result = json.loads(ai_tools.execute_tool(self._req(self.owner), 'get_pending_exchanges', {}))
        self.assertEqual(result['count'], 1)

    def test_get_open_complaints_counts_open_and_in_progress(self):
        from inbox.models import Conversation
        Conversation.objects.create(store=self.store, channel='complaint', status='open', customer_phone='0555000000')
        Conversation.objects.create(store=self.store, channel='complaint', status='resolved', customer_phone='0555000001')
        result = json.loads(ai_tools.execute_tool(self._req(self.owner), 'get_open_complaints', {}))
        self.assertEqual(result['count'], 1)

    def test_get_costs_summary_groups_by_category(self):
        from datetime import date
        from finance.models import Cost
        Cost.objects.create(store=self.store, category='marketing', label='Facebook Ads', amount=5000,
                             period_start=date(2026, 9, 1), period_end=date(2026, 9, 30))
        result = json.loads(ai_tools.execute_tool(self._req(self.owner), 'get_costs_summary', {}))
        self.assertGreater(result['total'], 0)

    def test_get_payments_summary_defaults_to_ready(self):
        result = json.loads(ai_tools.execute_tool(self._req(self.owner), 'get_payments_summary', {}))
        self.assertIn('orders_count', result)

    def test_get_subscription_status_owner_only(self):
        member_user, _ = make_team_member(self.store, role='confirmateur')
        result = ai_tools.execute_tool(self._req(member_user), 'get_subscription_status', {})
        self.assertIn("n'avez pas la permission", result)

    def test_get_subscription_status_returns_quota(self):
        result = json.loads(ai_tools.execute_tool(self._req(self.owner), 'get_subscription_status', {}))
        self.assertIn('orders_remaining', result)


class ChatLoopTest(TestCase):
    @patch('ai_assistant.chat_loop.ollama_client.chat')
    def test_returns_final_content_without_tool_call(self, mock_chat):
        from ai_assistant.chat_loop import run_chat_loop
        mock_chat.return_value = {'role': 'assistant', 'content': 'Bonjour !'}
        history = [{'role': 'user', 'content': 'Salut'}]
        result, pending_action_id = run_chat_loop(history, tool_definitions=[], tool_executor=lambda n, a: '')
        self.assertEqual(result, 'Bonjour !')
        self.assertIsNone(pending_action_id)

    @patch('ai_assistant.chat_loop.ollama_client.chat')
    def test_executes_tool_then_returns_final_content(self, mock_chat):
        from ai_assistant.chat_loop import run_chat_loop
        mock_chat.side_effect = [
            {'role': 'assistant', 'content': '', 'tool_calls': [
                {'id': 'call1', 'function': {'name': 'ping', 'arguments': {}}}
            ]},
            {'role': 'assistant', 'content': 'Pong.'},
        ]
        executed = []
        def executor(name, arguments):
            executed.append((name, arguments))
            return 'ok'
        history = [{'role': 'user', 'content': 'ping ?'}]
        result, pending_action_id = run_chat_loop(history, tool_definitions=[{'type': 'function'}], tool_executor=executor)
        self.assertEqual(result, 'Pong.')
        self.assertIsNone(pending_action_id)
        self.assertEqual(executed, [('ping', {})])

    @patch('ai_assistant.chat_loop.ollama_client.chat')
    def test_propagates_unavailable_error(self, mock_chat):
        from ai_assistant.chat_loop import run_chat_loop
        from ai_assistant.ollama_client import OllamaUnavailableError
        mock_chat.side_effect = OllamaUnavailableError('down')
        with self.assertRaises(OllamaUnavailableError):
            run_chat_loop([{'role': 'user', 'content': 'x'}], tool_definitions=[], tool_executor=lambda n, a: '')


class ChatViewTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.client_ = auth_client(self.owner)

    @patch('ai_assistant.views.ollama_client.chat')
    def test_chat_creates_conversation_and_replies(self, mock_chat):
        mock_chat.return_value = {'role': 'assistant', 'content': 'Bonjour, comment puis-je vous aider ?'}
        resp = self.client_.post('/api/ai/chat/', {'message': 'Salut'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('conversation_id', resp.data)
        self.assertEqual(AIConversation.objects.count(), 1)
        self.assertEqual(AIConversation.objects.first().messages.count(), 2)  # user + assistant

    @patch('ai_assistant.views.ollama_client.chat')
    def test_chat_executes_tool_call(self, mock_chat):
        mock_chat.side_effect = [
            {'role': 'assistant', 'content': '', 'tool_calls': [
                {'function': {'name': 'get_low_stock', 'arguments': {}}}
            ]},
            {'role': 'assistant', 'content': 'Vous avez 0 produit en stock bas.'},
        ]
        resp = self.client_.post('/api/ai/chat/', {'message': 'Quel est mon stock bas ?'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(mock_chat.call_count, 2)

    def test_list_conversations(self):
        AIConversation.objects.create(store=self.store, user=self.owner, title='Ancienne')
        resp = self.client_.get('/api/ai/conversations/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_delete_conversation(self):
        conv = AIConversation.objects.create(store=self.store, user=self.owner, title='À supprimer')
        resp = self.client_.delete(f'/api/ai/conversations/{conv.id}/')
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(AIConversation.objects.filter(pk=conv.id).exists())

    def test_delete_conversation_of_another_user_404(self):
        other_owner, other_store = make_owner()
        conv = AIConversation.objects.create(store=other_store, user=other_owner, title='Pas la mienne')
        resp = self.client_.delete(f'/api/ai/conversations/{conv.id}/')
        self.assertEqual(resp.status_code, 404)
        self.assertTrue(AIConversation.objects.filter(pk=conv.id).exists())


class PublicToolsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        from products.models import Product
        Product.objects.create(store=self.store, name='Chaise en bois', price=5000, stock=10, is_active=True)
        Product.objects.create(store=self.store, name='Table basse', price=15000, stock=0, is_active=True)
        Product.objects.create(store=self.store, name='Produit désactivé', price=1000, stock=5, is_active=False)

    def test_public_search_products_matches_name(self):
        result = ai_tools.public_search_products(self.store, 'chaise')
        self.assertIn('Chaise en bois', result)
        self.assertNotIn('Table basse', result)

    def test_public_search_products_excludes_inactive(self):
        result = ai_tools.public_search_products(self.store, 'désactivé')
        self.assertIn('"products": []', result)

    def test_public_get_order_status_requires_matching_phone_and_id(self):
        from orders.models import Order
        order = Order.objects.create(
            store=self.store, first_name='Amine', phone='0555000000',
            wilaya='Alger', status='shipped', carrier_tracking_number='TRACK123', total=5000,
        )
        result = ai_tools.public_get_order_status(self.store, '0555000000', order.id)
        self.assertIn('TRACK123', result)

    def test_public_get_order_status_wrong_phone_generic_message(self):
        from orders.models import Order
        order = Order.objects.create(
            store=self.store, first_name='Amine', phone='0555000000',
            wilaya='Alger', status='shipped', total=5000,
        )
        result_wrong_phone = ai_tools.public_get_order_status(self.store, '0555999999', order.id)
        result_wrong_id = ai_tools.public_get_order_status(self.store, '0555000000', order.id + 999)
        self.assertEqual(result_wrong_phone, result_wrong_id)
        self.assertIn('aucune commande trouv', result_wrong_phone.lower())

    def test_execute_public_tool_unknown_name(self):
        result = ai_tools.execute_public_tool(self.store, 'nope', {})
        self.assertIn('Outil inconnu', result)


class PublicChatViewTest(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        self.owner, self.store = make_owner()
        self.client_ = APIClient()

    def test_unknown_store_404(self):
        resp = self.client_.post('/api/public/store/inexistante/chat/', {'session_id': 'abc', 'message': 'salut'}, format='json')
        self.assertEqual(resp.status_code, 404)

    def test_missing_message_400(self):
        resp = self.client_.post(f'/api/public/store/{self.store.slug}/chat/', {'session_id': 'abc', 'message': ''}, format='json')
        self.assertEqual(resp.status_code, 400)

    @patch('ai_assistant.public_views.ollama_client.chat')
    def test_creates_conversation_by_session_id_and_replies(self, mock_chat):
        mock_chat.return_value = {'role': 'assistant', 'content': 'Bonjour, comment puis-je vous aider ?'}
        resp = self.client_.post(f'/api/public/store/{self.store.slug}/chat/', {'session_id': 'visitor-1', 'message': 'Bonjour'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('Bonjour, comment puis-je vous aider', resp.data['reply'])
        conv = AIConversation.objects.get(store=self.store, session_id='visitor-1')
        self.assertIsNone(conv.user)
        self.assertEqual(conv.messages.filter(role__in=['user', 'assistant']).count(), 2)

    @patch('ai_assistant.public_views.ollama_client.chat')
    def test_ollama_down_returns_503(self, mock_chat):
        from ai_assistant.ollama_client import OllamaUnavailableError
        mock_chat.side_effect = OllamaUnavailableError('down')
        resp = self.client_.post(f'/api/public/store/{self.store.slug}/chat/', {'session_id': 'visitor-2', 'message': 'salut'}, format='json')
        self.assertEqual(resp.status_code, 503)

    def test_history_empty_for_unknown_session(self):
        resp = self.client_.get(f'/api/public/store/{self.store.slug}/chat/never-seen/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['messages'], [])

    @patch('ai_assistant.public_views.ollama_client.chat')
    def test_history_restores_previous_messages(self, mock_chat):
        mock_chat.return_value = {'role': 'assistant', 'content': 'Réponse.'}
        self.client_.post(f'/api/public/store/{self.store.slug}/chat/', {'session_id': 'visitor-3', 'message': 'Question ?'}, format='json')
        resp = self.client_.get(f'/api/public/store/{self.store.slug}/chat/visitor-3/')
        self.assertEqual(resp.status_code, 200)
        roles = [m['role'] for m in resp.data['messages']]
        self.assertEqual(roles, ['user', 'assistant'])

    def test_conversation_of_one_session_not_visible_to_another(self):
        AIConversation.objects.create(store=self.store, session_id='visitor-A', title='Secrète')
        resp = self.client_.get(f'/api/public/store/{self.store.slug}/chat/visitor-B/')
        self.assertEqual(resp.data['messages'], [])


class ChatLoopWriteToolTest(TestCase):
    @patch('ai_assistant.ollama_client.chat')
    def test_stops_immediately_after_write_tool_call(self, mock_chat):
        mock_chat.return_value = {
            'content': '',
            'tool_calls': [{'id': 'call_1', 'function': {'name': 'propose_update_product', 'arguments': {}}}],
        }
        history = [{'role': 'user', 'content': 'Baisse le prix de X'}]

        def tool_executor(name, arguments):
            return json.dumps({'status': 'en_attente_de_confirmation', 'action_id': 42})

        content, pending_action_id = run_chat_loop(
            history, [], tool_executor, write_tool_names={'propose_update_product'},
        )
        self.assertEqual(content, '')
        self.assertEqual(pending_action_id, 42)
        self.assertEqual(mock_chat.call_count, 1)  # un seul tour, jamais de 2e appel modèle

    @patch('ai_assistant.ollama_client.chat')
    def test_read_tool_continues_loop_as_before(self, mock_chat):
        mock_chat.side_effect = [
            {'content': '', 'tool_calls': [{'id': 'call_1', 'function': {'name': 'get_low_stock', 'arguments': {}}}]},
            {'content': 'Voici votre stock bas.', 'tool_calls': []},
        ]
        history = [{'role': 'user', 'content': 'Stock bas ?'}]
        content, pending_action_id = run_chat_loop(
            history, [], lambda name, args: '{"products": []}', write_tool_names=set(),
        )
        self.assertEqual(content, 'Voici votre stock bas.')
        self.assertIsNone(pending_action_id)
        self.assertEqual(mock_chat.call_count, 2)


@override_settings(AI_PROVIDER='groq', GROQ_API_KEY='test-key', GROQ_VISION_MODEL='test-vision-model')
class ScanProductViewTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        from core.test_utils import clear_throttle_cache
        clear_throttle_cache()

    def _image_file(self, name='produit.jpg'):
        return SimpleUploadedFile(name, b'\xff\xd8\xff' + b'0' * 100, content_type='image/jpeg')

    @patch('ai_assistant.views.vision_client.extract_product_from_image')
    def test_scan_single_product_creates_one_draft(self, mock_extract):
        mock_extract.return_value = {'type': 'product', 'data': {'name': 'Casquette', 'price': 1200, 'category': 'Accessoires'}}
        client = auth_client(self.owner)
        resp = client.post('/api/ai/scan/', {'image': self._image_file()}, format='multipart')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['type'], 'product')
        self.assertEqual(resp.data['draft']['extracted_data']['name'], 'Casquette')
        self.assertEqual(AIProductDraft.objects.filter(store=self.store, source='photo').count(), 1)

    @patch('ai_assistant.views.vision_client.extract_product_from_image')
    def test_scan_invoice_creates_multiple_drafts(self, mock_extract):
        mock_extract.return_value = {'type': 'invoice', 'items': [
            {'name': 'Produit A', 'price': 100}, {'name': 'Produit B', 'price': 200},
        ]}
        client = auth_client(self.owner)
        resp = client.post('/api/ai/scan/', {'image': self._image_file()}, format='multipart')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['type'], 'invoice')
        self.assertEqual(len(resp.data['drafts']), 2)
        self.assertEqual(AIProductDraft.objects.filter(store=self.store, source='invoice').count(), 2)

    def test_scan_forbidden_for_confirmateur(self):
        confirmateur, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(confirmateur)
        resp = client.post('/api/ai/scan/', {'image': self._image_file()}, format='multipart')
        self.assertEqual(resp.status_code, 403)

    def test_scan_rejects_disallowed_extension(self):
        client = auth_client(self.owner)
        bad_file = SimpleUploadedFile('malware.exe', b'MZ' + b'0' * 100, content_type='application/octet-stream')
        resp = client.post('/api/ai/scan/', {'image': bad_file}, format='multipart')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(AIProductDraft.objects.count(), 0)

    @patch('ai_assistant.views.vision_client.extract_product_from_image')
    def test_scan_malformed_model_response_returns_502(self, mock_extract):
        mock_extract.side_effect = ValueError('JSON invalide')
        client = auth_client(self.owner)
        resp = client.post('/api/ai/scan/', {'image': self._image_file()}, format='multipart')
        self.assertEqual(resp.status_code, 502)
        self.assertEqual(AIProductDraft.objects.count(), 0)

    @patch('ai_assistant.views.vision_client.extract_product_from_image')
    def test_scan_provider_unavailable_returns_503(self, mock_extract):
        mock_extract.side_effect = vision_client.OllamaUnavailableError('panne')
        client = auth_client(self.owner)
        resp = client.post('/api/ai/scan/', {'image': self._image_file()}, format='multipart')
        self.assertEqual(resp.status_code, 503)


class ProductDraftEndpointsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.draft = AIProductDraft.objects.create(
            store=self.store, source='invoice', extracted_data={'name': 'Sac à dos', 'price': 3500},
        )

    def test_list_only_pending_review_invoice_drafts(self):
        AIProductDraft.objects.create(store=self.store, source='photo', extracted_data={'name': 'Photo produit', 'price': 100})
        AIProductDraft.objects.create(store=self.store, source='invoice', extracted_data={'name': 'Déjà créé', 'price': 100}, status='created')
        client = auth_client(self.owner)
        resp = client.get('/api/ai/product-drafts/')
        self.assertEqual(resp.status_code, 200)
        names = [d['extracted_data']['name'] for d in resp.data]
        self.assertIn('Sac à dos', names)
        self.assertNotIn('Photo produit', names)
        self.assertNotIn('Déjà créé', names)

    def test_create_from_draft(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/product-drafts/{self.draft.id}/create/')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['name'], 'Sac à dos')
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, 'created')
        self.assertIsNotNone(self.draft.created_product)

    def test_create_from_already_resolved_draft_returns_404(self):
        self.draft.status = 'created'
        self.draft.save(update_fields=['status'])
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/product-drafts/{self.draft.id}/create/')
        self.assertEqual(resp.status_code, 404)

    def test_discard_draft(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/product-drafts/{self.draft.id}/discard/')
        self.assertEqual(resp.status_code, 200)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, 'discarded')

    def test_forbidden_for_confirmateur(self):
        confirmateur, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(confirmateur)
        resp = client.get('/api/ai/product-drafts/')
        self.assertEqual(resp.status_code, 403)


class VisionClientTest(TestCase):
    @patch('ai_assistant.vision_client.requests.post')
    def test_extract_product_from_photo(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {'choices': [{'message': {'content': '{"type": "product", "data": {"name": "Casquette", "price": 1200}}'}}]},
        )
        result = vision_client.extract_product_from_image(b'fake-image-bytes')
        self.assertEqual(result['type'], 'product')
        self.assertEqual(result['data']['name'], 'Casquette')

    @patch('ai_assistant.vision_client.requests.post')
    def test_extract_invoice_multiple_items(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {'choices': [{'message': {'content': '{"type": "invoice", "items": [{"name": "A", "price": 100}, {"name": "B", "price": 200}]}'}}]},
        )
        result = vision_client.extract_product_from_image(b'fake-image-bytes')
        self.assertEqual(result['type'], 'invoice')
        self.assertEqual(len(result['items']), 2)

    @patch('ai_assistant.vision_client.requests.post')
    def test_invalid_json_raises_value_error(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {'choices': [{'message': {'content': 'pas du json'}}]},
        )
        with self.assertRaises(ValueError):
            vision_client.extract_product_from_image(b'fake-image-bytes')

    @patch('ai_assistant.vision_client.requests.post')
    def test_provider_error_raises_unavailable(self, mock_post):
        mock_post.return_value = MagicMock(status_code=500, text='erreur serveur')
        with self.assertRaises(vision_client.OllamaUnavailableError):
            vision_client.extract_product_from_image(b'fake-image-bytes')

    @override_settings(AI_PROVIDER='ollama')
    def test_ollama_provider_not_supported_yet(self):
        with self.assertRaises(vision_client.OllamaUnavailableError):
            vision_client.extract_product_from_image(b'fake-image-bytes')


class ChatViewWriteToolIntegrationTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.product = Product.objects.create(store=self.store, name='T-shirt', price=2000, stock=10)
        from core.test_utils import clear_throttle_cache
        clear_throttle_cache()

    @patch('ai_assistant.ollama_client.chat')
    def test_write_tool_call_returns_pending_action(self, mock_chat):
        mock_chat.return_value = {
            'content': '',
            'tool_calls': [{'id': 'c1', 'function': {
                'name': 'propose_update_product',
                'arguments': {'name_or_id': 'T-shirt', 'price': 1800},
            }}],
        }
        client = auth_client(self.owner)
        resp = client.post('/api/ai/chat/', {'message': 'Baisse le prix du T-shirt à 1800'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNotNone(resp.data.get('pending_action'))
        self.assertEqual(resp.data['pending_action']['status'], 'pending')
        self.product.refresh_from_db()
        self.assertEqual(self.product.price, 2000)

    @patch('ai_assistant.ollama_client.chat')
    def test_write_tools_not_offered_to_confirmateur(self, mock_chat):
        confirmateur, _ = make_team_member(self.store, 'confirmateur')
        from team.models import RolePermission
        RolePermission.objects.create(store=self.store, role='confirmateur', permission='ai_assistant_view', enabled=True)
        mock_chat.return_value = {'content': 'Réponse simple.', 'tool_calls': []}
        client = auth_client(confirmateur)
        resp = client.post('/api/ai/chat/', {'message': 'Baisse le prix'}, format='json')
        self.assertEqual(resp.status_code, 200)
        sent_tools = mock_chat.call_args.kwargs.get('tools')
        tool_names = [t['function']['name'] for t in (sent_tools or [])]
        self.assertNotIn('propose_update_product', tool_names)


class PendingActionConfirmRejectTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conv = AIConversation.objects.create(store=self.store, user=self.owner, title='Test')
        self.product = Product.objects.create(store=self.store, name='T-shirt', price=2000, stock=10)
        self.action = AIPendingAction.objects.create(
            conversation=self.conv, tool_name='propose_update_product', summary='Modifier T-shirt',
            payload=[{'id': self.product.id, 'name': 'T-shirt', 'before': {'price': 2000.0}, 'after': {'price': 1500.0}}],
            target_ids=[self.product.id], expires_at=timezone.now() + timedelta(minutes=15),
        )

    def test_confirm_executes_and_journalise(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/pending-actions/{self.action.id}/confirm/')
        self.assertEqual(resp.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(float(self.product.price), 1500.0)
        self.action.refresh_from_db()
        self.assertEqual(self.action.status, 'confirmed')
        self.assertIsNotNone(self.action.resolved_at)
        log = AuditLog.objects.filter(action='ai_agent.action_confirmed').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.actor_role, 'ai_agent')

    def test_reject_does_not_execute(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/pending-actions/{self.action.id}/reject/')
        self.assertEqual(resp.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(float(self.product.price), 2000.0)
        self.action.refresh_from_db()
        self.assertEqual(self.action.status, 'rejected')

    def test_confirm_forbidden_for_confirmateur(self):
        confirmateur, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(confirmateur)
        resp = client.post(f'/api/ai/pending-actions/{self.action.id}/confirm/')
        self.assertEqual(resp.status_code, 403)
        self.action.refresh_from_db()
        self.assertEqual(self.action.status, 'pending')

    def test_confirm_expired_action_returns_409(self):
        self.action.expires_at = timezone.now() - timedelta(minutes=1)
        self.action.save(update_fields=['expires_at'])
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/pending-actions/{self.action.id}/confirm/')
        self.assertEqual(resp.status_code, 409)
        self.action.refresh_from_db()
        self.assertEqual(self.action.status, 'expired')
        self.product.refresh_from_db()
        self.assertEqual(float(self.product.price), 2000.0)

    def test_confirm_already_resolved_returns_409(self):
        self.action.status = 'confirmed'
        self.action.save(update_fields=['status'])
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/pending-actions/{self.action.id}/confirm/')
        self.assertEqual(resp.status_code, 409)

    def test_bulk_update_execution(self):
        p2 = Product.objects.create(store=self.store, name='Pantalon', price=3000, is_active=True)
        bulk_action = AIPendingAction.objects.create(
            conversation=self.conv, tool_name='propose_bulk_update_products', summary='Désactiver 2 produits',
            payload=[
                {'id': self.product.id, 'name': 'T-shirt', 'before': {'is_active': True}, 'after': {'is_active': False}},
                {'id': p2.id, 'name': 'Pantalon', 'before': {'is_active': True}, 'after': {'is_active': False}},
            ],
            target_ids=[self.product.id, p2.id], expires_at=timezone.now() + timedelta(minutes=15),
        )
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/pending-actions/{bulk_action.id}/confirm/')
        self.assertEqual(resp.status_code, 200)
        self.product.refresh_from_db()
        p2.refresh_from_db()
        self.assertFalse(self.product.is_active)
        self.assertFalse(p2.is_active)

    def test_create_product_execution(self):
        draft = AIProductDraft.objects.create(store=self.store, source='chat_text', extracted_data={'name': 'Casquette', 'price': 1200.0})
        action = AIPendingAction.objects.create(
            conversation=self.conv, tool_name='propose_create_product', summary='Créer Casquette',
            payload=[{'id': None, 'name': 'Casquette', 'before': None, 'after': {'name': 'Casquette', 'price': 1200.0}}],
            target_ids=[draft.id], expires_at=timezone.now() + timedelta(minutes=15),
        )
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/pending-actions/{action.id}/confirm/')
        self.assertEqual(resp.status_code, 200)
        draft.refresh_from_db()
        self.assertEqual(draft.status, 'created')
        self.assertIsNotNone(draft.created_product)
        self.assertEqual(draft.created_product.name, 'Casquette')

    def test_order_status_execution(self):
        order = Order.objects.create(
            store=self.store, first_name='Ali', last_name='B', phone='0555000000',
            wilaya='Alger', address='Rue 1', status='pending', subtotal=1000, shipping_cost=0, total=1000,
        )
        action = AIPendingAction.objects.create(
            conversation=self.conv, tool_name='propose_update_order_status', summary='Confirmer commande',
            payload=[{'id': order.id, 'name': f'Commande #{order.id}', 'before': {'status': 'pending'}, 'after': {'status': 'confirmed', 'note': 'via IA'}}],
            target_ids=[order.id], expires_at=timezone.now() + timedelta(minutes=15),
        )
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/pending-actions/{action.id}/confirm/')
        self.assertEqual(resp.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, 'confirmed')


class ProposeUpdateProductTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conv = AIConversation.objects.create(store=self.store, user=self.owner, title='Test')
        self.product = Product.objects.create(store=self.store, name='T-shirt noir', price=2000, stock=10)

    def _request(self, user):
        request = type('R', (), {})()
        request.user = user
        return request

    def test_forbidden_for_confirmateur(self):
        from ai_assistant import write_tools
        confirmateur, _ = make_team_member(self.store, 'confirmateur')
        result = write_tools.propose_update_product(self._request(confirmateur), self.conv, 'T-shirt noir', price=1800)
        self.assertIn('réservée', result.lower())
        self.assertEqual(AIPendingAction.objects.count(), 0)

    def test_creates_pending_action_with_before_after(self):
        from ai_assistant import write_tools
        result = write_tools.propose_update_product(self._request(self.owner), self.conv, 'T-shirt noir', price=1800, stock=5)
        data = json.loads(result)
        self.assertEqual(data['status'], 'en_attente_de_confirmation')
        action = AIPendingAction.objects.get(pk=data['action_id'])
        self.assertEqual(action.tool_name, 'propose_update_product')
        self.assertEqual(action.target_ids, [self.product.id])
        self.assertEqual(action.payload[0]['before']['price'], 2000.0)
        self.assertEqual(action.payload[0]['after']['price'], 1800.0)
        self.assertEqual(action.payload[0]['after']['stock'], 5)
        # rien n'a encore été écrit sur le produit réel
        self.product.refresh_from_db()
        self.assertEqual(self.product.price, 2000)

    def test_product_not_found(self):
        from ai_assistant import write_tools
        result = write_tools.propose_update_product(self._request(self.owner), self.conv, 'Produit inexistant', price=100)
        self.assertIn('introuvable', result.lower())
        self.assertEqual(AIPendingAction.objects.count(), 0)

    def test_no_changes_requested(self):
        from ai_assistant import write_tools
        result = write_tools.propose_update_product(self._request(self.owner), self.conv, 'T-shirt noir')
        self.assertIn('aucun changement', result.lower())
        self.assertEqual(AIPendingAction.objects.count(), 0)


class ProposeBulkUpdateProductsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conv = AIConversation.objects.create(store=self.store, user=self.owner, title='Test')
        self.cat = Category.objects.create(store=self.store, name='Été')
        for i in range(3):
            p = Product.objects.create(store=self.store, name=f'Produit {i}', price=1000, is_active=True)
            p.categories.add(self.cat)

    def _request(self, user):
        request = type('R', (), {})()
        request.user = user
        return request

    def test_bulk_deactivate_by_category(self):
        from ai_assistant import write_tools
        result = write_tools.propose_bulk_update_products(self._request(self.owner), self.conv, category='Été', is_active=False)
        data = json.loads(result)
        action = AIPendingAction.objects.get(pk=data['action_id'])
        self.assertEqual(len(action.target_ids), 3)
        self.assertTrue(all(item['after']['is_active'] is False for item in action.payload))

    def test_bulk_capped_at_50(self):
        from ai_assistant import write_tools
        big_cat = Category.objects.create(store=self.store, name='Grosse categorie')
        for i in range(51):
            p = Product.objects.create(store=self.store, name=f'Bulk {i}', price=500, is_active=True)
            p.categories.add(big_cat)
        result = write_tools.propose_bulk_update_products(self._request(self.owner), self.conv, category='Grosse categorie', is_active=False)
        self.assertIn('50', result)
        self.assertEqual(AIPendingAction.objects.count(), 0)

    def test_no_match_returns_message(self):
        from ai_assistant import write_tools
        result = write_tools.propose_bulk_update_products(self._request(self.owner), self.conv, category='Inconnue', is_active=False)
        self.assertIn('aucun produit', result.lower())


class ProposeCreateProductTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conv = AIConversation.objects.create(store=self.store, user=self.owner, title='Test')

    def _request(self, user):
        request = type('R', (), {})()
        request.user = user
        return request

    def test_creates_draft_and_pending_action(self):
        from ai_assistant import write_tools
        result = write_tools.propose_create_product(self._request(self.owner), self.conv, name='Casquette rouge', price=1500)
        data = json.loads(result)
        action = AIPendingAction.objects.get(pk=data['action_id'])
        self.assertEqual(action.tool_name, 'propose_create_product')
        draft = AIProductDraft.objects.get(pk=action.target_ids[0])
        self.assertEqual(draft.source, 'chat_text')
        self.assertEqual(draft.extracted_data['name'], 'Casquette rouge')
        self.assertEqual(draft.status, 'pending_review')

    def test_missing_price_rejected(self):
        from ai_assistant import write_tools
        result = write_tools.propose_create_product(self._request(self.owner), self.conv, name='X', price=None)
        self.assertIn('requis', result.lower())
        self.assertEqual(AIPendingAction.objects.count(), 0)


class ProposeUpdateOrderStatusTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conv = AIConversation.objects.create(store=self.store, user=self.owner, title='Test')
        self.order = Order.objects.create(
            store=self.store, first_name='Ali', last_name='B', phone='0555000000',
            wilaya='Alger', address='Rue 1', status='pending', subtotal=1000, shipping_cost=0, total=1000,
        )

    def _request(self, user):
        request = type('R', (), {})()
        request.user = user
        return request

    def test_creates_pending_action(self):
        from ai_assistant import write_tools
        result = write_tools.propose_update_order_status(self._request(self.owner), self.conv, order_number=str(self.order.id), new_status='confirmed')
        data = json.loads(result)
        action = AIPendingAction.objects.get(pk=data['action_id'])
        self.assertEqual(action.target_ids, [self.order.id])
        self.assertEqual(action.payload[0]['after']['status'], 'confirmed')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'pending')  # rien exécuté

    def test_order_not_found(self):
        from ai_assistant import write_tools
        result = write_tools.propose_update_order_status(self._request(self.owner), self.conv, order_number='999999', new_status='confirmed')
        self.assertIn('introuvable', result.lower())

    def test_invalid_status_rejected(self):
        from ai_assistant import write_tools
        result = write_tools.propose_update_order_status(self._request(self.owner), self.conv, order_number=str(self.order.id), new_status='statut_bidon')
        self.assertIn('invalide', result.lower())
        self.assertEqual(AIPendingAction.objects.count(), 0)

    def test_already_at_target_status(self):
        from ai_assistant import write_tools
        result = write_tools.propose_update_order_status(self._request(self.owner), self.conv, order_number=str(self.order.id), new_status='pending')
        self.assertIn('déjà', result.lower())
        self.assertEqual(AIPendingAction.objects.count(), 0)


class SerializerTest(TestCase):
    def test_message_serializer_includes_pending_action(self):
        owner, store = make_owner()
        conv = AIConversation.objects.create(store=store, user=owner, title='Test')
        action = AIPendingAction.objects.create(
            conversation=conv, tool_name='propose_update_product', summary='Test résumé',
            payload=[{'id': 1}], target_ids=[1], expires_at=timezone.now() + timedelta(minutes=15),
        )
        msg = AIMessage.objects.create(conversation=conv, role='assistant', content='', pending_action=action)
        data = AIMessageSerializer(msg).data
        self.assertEqual(data['pending_action']['summary'], 'Test résumé')
        self.assertEqual(data['pending_action']['status'], 'pending')

    def test_message_serializer_pending_action_null_by_default(self):
        owner, store = make_owner()
        conv = AIConversation.objects.create(store=store, user=owner, title='Test')
        msg = AIMessage.objects.create(conversation=conv, role='assistant', content='Bonjour')
        data = AIMessageSerializer(msg).data
        self.assertIsNone(data['pending_action'])


class AIPendingActionModelTest(TestCase):
    def test_create_and_expire(self):
        owner, store = make_owner()
        conv = AIConversation.objects.create(store=store, user=owner, title='Test')
        action = AIPendingAction.objects.create(
            conversation=conv, tool_name='propose_update_product', summary='Test',
            payload=[{'id': 1, 'name': 'X', 'before': {}, 'after': {}}], target_ids=[1],
            expires_at=timezone.now() + timedelta(minutes=15),
        )
        self.assertEqual(action.status, 'pending')
        self.assertFalse(action.is_expired())
        action.expires_at = timezone.now() - timedelta(minutes=1)
        action.save(update_fields=['expires_at'])
        self.assertTrue(action.is_expired())

    def test_message_can_reference_pending_action(self):
        owner, store = make_owner()
        conv = AIConversation.objects.create(store=store, user=owner, title='Test')
        action = AIPendingAction.objects.create(
            conversation=conv, tool_name='propose_update_product', summary='Test',
            payload=[], target_ids=[], expires_at=timezone.now() + timedelta(minutes=15),
        )
        msg = AIMessage.objects.create(conversation=conv, role='assistant', content='', pending_action=action)
        self.assertEqual(msg.pending_action_id, action.id)


class AIProductDraftModelTest(TestCase):
    def test_create_draft(self):
        owner, store = make_owner()
        draft = AIProductDraft.objects.create(
            store=store, source='photo', extracted_data={'name': 'T-shirt', 'price': 2500},
        )
        self.assertEqual(draft.status, 'pending_review')
        self.assertIsNone(draft.created_product)
