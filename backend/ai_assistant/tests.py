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

    def test_confirmateur_without_stock_view_refused(self):
        from rest_framework.test import APIRequestFactory
        member_user, member = make_team_member(self.store, role='confirmateur')
        factory = APIRequestFactory()
        req = factory.get('/api/ai/chat/')
        req.user = member_user
        result = ai_tools.execute_tool(req, 'get_low_stock', {})
        self.assertIn("n'avez pas la permission", result)


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
