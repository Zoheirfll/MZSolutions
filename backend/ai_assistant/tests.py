import json
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings

from core.test_utils import make_owner, make_team_member, auth_client
from team.models import PERMISSION_CATALOG, DEFAULT_PERMISSIONS
from .models import AIConversation, AIMessage
from . import ollama_client
from . import tools as ai_tools


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


class ChatLoopTest(TestCase):
    @patch('ai_assistant.chat_loop.ollama_client.chat')
    def test_returns_final_content_without_tool_call(self, mock_chat):
        from ai_assistant.chat_loop import run_chat_loop
        mock_chat.return_value = {'role': 'assistant', 'content': 'Bonjour !'}
        history = [{'role': 'user', 'content': 'Salut'}]
        result = run_chat_loop(history, tool_definitions=[], tool_executor=lambda n, a: '')
        self.assertEqual(result, 'Bonjour !')

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
        result = run_chat_loop(history, tool_definitions=[{'type': 'function'}], tool_executor=executor)
        self.assertEqual(result, 'Pong.')
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
