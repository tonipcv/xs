"""
Tests for XASE Sheets Python SDK
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from xase import XaseClient
from xase.exceptions import XaseAPIError, XaseAuthError, XaseNotFoundError


@pytest.fixture
def client():
    """Create test client"""
    return XaseClient(api_key='test-api-key', base_url='https://api.test.xase.ai')


@pytest.fixture
def mock_session():
    """Mock requests session"""
    with patch('xase.client.requests.Session') as mock:
        yield mock


class TestClientInitialization:
    """Test client initialization"""
    
    def test_init_with_config(self, client):
        """Test initialization with config"""
        assert client.api_key == 'test-api-key'
        assert client.base_url == 'https://api.test.xase.ai'
    
    def test_init_default_base_url(self):
        """Test default base URL"""
        client = XaseClient(api_key='test-key')
        assert client.base_url == 'https://api.xase.ai'


class TestDatasets:
    """Test dataset operations"""
    
    def test_list_datasets(self, client, mock_session):
        """Test listing datasets"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'datasets': [
                {'id': 'ds_1', 'name': 'Dataset 1'},
                {'id': 'ds_2', 'name': 'Dataset 2'},
            ],
            'total': 2,
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.list_datasets()
        assert len(result['datasets']) == 2
        assert result['total'] == 2
    
    def test_get_dataset(self, client):
        """Test getting dataset by ID"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'id': 'ds_1',
            'name': 'Test Dataset',
            'dataType': 'AUDIO',
            'size': 1024000,
            'createdAt': '2024-01-01T00:00:00Z',
            'updatedAt': '2024-01-01T00:00:00Z',
            'tenantId': 'tenant_1',
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.get_dataset('ds_1')
        assert result.id == 'ds_1'
        assert result.name == 'Test Dataset'
        assert result.dataType == 'AUDIO'
    
    def test_create_dataset(self, client):
        """Test creating dataset"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'id': 'ds_new',
            'name': 'New Dataset',
            'dataType': 'AUDIO',
            'size': 0,
            'createdAt': '2024-01-01T00:00:00Z',
            'updatedAt': '2024-01-01T00:00:00Z',
            'tenantId': 'tenant_1',
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.create_dataset(
            name='New Dataset',
            data_type='AUDIO',
            description='Test description'
        )
        
        assert result.id == 'ds_new'
        assert result.name == 'New Dataset'
    
    def test_update_dataset(self, client):
        """Test updating dataset"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'id': 'ds_1',
            'name': 'Updated Dataset',
            'dataType': 'AUDIO',
            'size': 1024000,
            'createdAt': '2024-01-01T00:00:00Z',
            'updatedAt': '2024-01-02T00:00:00Z',
            'tenantId': 'tenant_1',
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.update_dataset('ds_1', name='Updated Dataset')
        assert result.name == 'Updated Dataset'
    
    def test_delete_dataset(self, client):
        """Test deleting dataset"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b''
        
        client.session.request = Mock(return_value=mock_response)
        
        client.delete_dataset('ds_1')
        # Should not raise exception


class TestLeases:
    """Test lease operations"""
    
    def test_create_lease(self, client):
        """Test creating lease"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'id': 'lease_1',
            'datasetId': 'ds_1',
            'clientId': 'client_1',
            'startTime': '2024-01-01T00:00:00Z',
            'endTime': '2024-01-01T01:00:00Z',
            'status': 'ACTIVE',
            'accessToken': 'token_123',
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.create_lease(
            dataset_id='ds_1',
            duration=3600,
            purpose='Testing'
        )
        
        assert result.id == 'lease_1'
        assert result.accessToken == 'token_123'
        assert result.status == 'ACTIVE'
    
    def test_get_lease(self, client):
        """Test getting lease by ID"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'id': 'lease_1',
            'datasetId': 'ds_1',
            'clientId': 'client_1',
            'startTime': '2024-01-01T00:00:00Z',
            'endTime': '2024-01-01T01:00:00Z',
            'status': 'ACTIVE',
            'accessToken': 'token_123',
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.get_lease('lease_1')
        assert result.id == 'lease_1'
    
    def test_list_leases(self, client):
        """Test listing leases"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'leases': [
                {'id': 'lease_1', 'status': 'ACTIVE'},
                {'id': 'lease_2', 'status': 'EXPIRED'},
            ],
            'total': 2,
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.list_leases()
        assert len(result['leases']) == 2
    
    def test_revoke_lease(self, client):
        """Test revoking lease"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b''
        
        client.session.request = Mock(return_value=mock_response)
        
        client.revoke_lease('lease_1')
        # Should not raise exception
    
    def test_renew_lease(self, client):
        """Test renewing lease"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'id': 'lease_1',
            'datasetId': 'ds_1',
            'clientId': 'client_1',
            'startTime': '2024-01-01T00:00:00Z',
            'endTime': '2024-01-01T02:00:00Z',
            'status': 'ACTIVE',
            'accessToken': 'token_123',
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.renew_lease('lease_1', duration=7200)
        assert result.id == 'lease_1'


class TestPolicies:
    """Test policy operations"""
    
    def test_create_policy(self, client):
        """Test creating policy"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'id': 'policy_1',
            'name': 'Test Policy',
            'datasetId': 'ds_1',
            'rules': {'maxDuration': 3600},
            'active': True,
            'createdAt': '2024-01-01T00:00:00Z',
            'updatedAt': '2024-01-01T00:00:00Z',
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.create_policy(
            name='Test Policy',
            dataset_id='ds_1',
            rules={'maxDuration': 3600}
        )
        
        assert result.id == 'policy_1'
        assert result.name == 'Test Policy'
    
    def test_get_policy(self, client):
        """Test getting policy by ID"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'id': 'policy_1',
            'name': 'Test Policy',
            'datasetId': 'ds_1',
            'rules': {},
            'active': True,
            'createdAt': '2024-01-01T00:00:00Z',
            'updatedAt': '2024-01-01T00:00:00Z',
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.get_policy('policy_1')
        assert result.id == 'policy_1'
    
    def test_list_policies(self, client):
        """Test listing policies"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'policies': [
                {'id': 'policy_1', 'active': True},
                {'id': 'policy_2', 'active': False},
            ],
            'total': 2,
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.list_policies()
        assert len(result['policies']) == 2


class TestUsageTracking:
    """Test usage tracking operations"""
    
    def test_record_usage(self, client):
        """Test recording usage"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b''
        
        client.session.request = Mock(return_value=mock_response)
        
        client.record_usage(
            lease_id='lease_1',
            bytes_transferred=1024000,
            records_accessed=100
        )
        # Should not raise exception
    
    def test_get_usage(self, client):
        """Test getting usage statistics"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {
                'id': 'usage_1',
                'leaseId': 'lease_1',
                'bytesTransferred': 1024000,
                'recordsAccessed': 100,
                'timestamp': '2024-01-01T00:00:00Z',
            }
        ]
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.get_usage()
        assert len(result) == 1
        assert result[0].bytesTransferred == 1024000


class TestMarketplace:
    """Test marketplace operations"""
    
    def test_list_offers(self, client):
        """Test listing offers"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'offers': [
                {'id': 'offer_1', 'price': 100},
                {'id': 'offer_2', 'price': 200},
            ],
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.list_offers()
        assert len(result['offers']) == 2
    
    def test_get_offer(self, client):
        """Test getting offer by ID"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'id': 'offer_1',
            'datasetId': 'ds_1',
            'price': 100,
            'currency': 'USD',
            'description': 'Test offer',
            'terms': 'Test terms',
            'active': True,
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.get_offer('offer_1')
        assert result.id == 'offer_1'
        assert result.price == 100
    
    def test_request_access(self, client):
        """Test requesting access"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'id': 'request_1',
            'offerId': 'offer_1',
            'requesterId': 'user_1',
            'purpose': 'Research',
            'status': 'PENDING',
            'createdAt': '2024-01-01T00:00:00Z',
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.request_access(
            offer_id='offer_1',
            purpose='Research'
        )
        
        assert result.id == 'request_1'
        assert result.status == 'PENDING'
    
    def test_search_marketplace(self, client):
        """Test searching marketplace"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'results': [
                {'id': 'ds_1', 'name': 'Dataset 1'},
                {'id': 'ds_2', 'name': 'Dataset 2'},
            ],
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.search_marketplace('audio')
        assert len(result['results']) == 2


class TestWebhooks:
    """Test webhook operations"""
    
    def test_create_webhook(self, client):
        """Test creating webhook"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'id': 'webhook_1',
            'url': 'https://example.com/webhook',
            'events': ['lease.created'],
            'secret': 'secret_123',
            'active': True,
            'createdAt': '2024-01-01T00:00:00Z',
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.create_webhook(
            url='https://example.com/webhook',
            events=['lease.created'],
            secret='secret_123'
        )
        
        assert result.id == 'webhook_1'
        assert result.url == 'https://example.com/webhook'
    
    def test_list_webhooks(self, client):
        """Test listing webhooks"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {'id': 'webhook_1', 'active': True, 'url': 'https://example.com/1', 'events': [], 'secret': 'secret', 'createdAt': '2024-01-01T00:00:00Z'},
            {'id': 'webhook_2', 'active': False, 'url': 'https://example.com/2', 'events': [], 'secret': 'secret', 'createdAt': '2024-01-01T00:00:00Z'},
        ]
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.list_webhooks()
        assert len(result) == 2
    
    def test_delete_webhook(self, client):
        """Test deleting webhook"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b''
        
        client.session.request = Mock(return_value=mock_response)
        
        client.delete_webhook('webhook_1')
        # Should not raise exception


class TestErrorHandling:
    """Test error handling"""
    
    def test_auth_error(self, client):
        """Test authentication error"""
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.content = b'{"error": "Unauthorized"}'
        mock_response.json.return_value = {'error': 'Unauthorized'}
        
        client.session.request = Mock(return_value=mock_response)
        
        with pytest.raises(XaseAuthError):
            client.get_dataset('ds_1')
    
    def test_not_found_error(self, client):
        """Test not found error"""
        mock_response = Mock()
        mock_response.status_code = 404
        mock_response.content = b'{"error": "Not found"}'
        mock_response.json.return_value = {'error': 'Not found'}
        
        client.session.request = Mock(return_value=mock_response)
        
        with pytest.raises(XaseNotFoundError):
            client.get_dataset('ds_invalid')
    
    def test_api_error(self, client):
        """Test general API error"""
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.content = b'{"error": "Internal server error"}'
        mock_response.json.return_value = {'error': 'Internal server error'}
        
        client.session.request = Mock(return_value=mock_response)
        
        with pytest.raises(XaseAPIError) as exc_info:
            client.get_dataset('ds_1')
        
        assert exc_info.value.status_code == 500


class TestContextManager:
    """Test context manager"""
    
    def test_context_manager(self):
        """Test using client as context manager"""
        with XaseClient(api_key='test-key') as client:
            assert client is not None
        # Session should be closed after exiting context


class TestHealthCheck:
    """Test health check"""
    
    def test_health(self, client):
        """Test health check"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'status': 'healthy',
            'timestamp': '2024-01-01T00:00:00Z',
        }
        
        client.session.request = Mock(return_value=mock_response)
        
        result = client.health()
        assert result['status'] == 'healthy'
