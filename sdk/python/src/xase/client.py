"""
XASE Sheets Python Client
Main client for interacting with XASE Sheets API
"""

import requests
from typing import Optional, Dict, List, Any
from datetime import datetime
import json

from .types import Dataset, Lease, Policy, Usage, Webhook, Offer, AccessRequest
from .exceptions import XaseAPIError, XaseAuthError, XaseNotFoundError


class XaseClient:
    """
    XASE Sheets API Client
    
    Example:
        >>> client = XaseClient(api_key='your-api-key')
        >>> datasets = client.list_datasets()
        >>> lease = client.create_lease(dataset_id='ds_123', duration=3600)
    """
    
    def __init__(
        self,
        api_key: str,
        base_url: str = 'https://api.xase.ai',
        timeout: int = 30,
    ):
        """
        Initialize XASE client
        
        Args:
            api_key: Your XASE API key
            base_url: API base URL (default: https://api.xase.ai)
            timeout: Request timeout in seconds (default: 30)
        """
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'User-Agent': 'xase-sdk-python/2.0.0',
        })
    
    def _request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict] = None,
        data: Optional[Dict] = None,
    ) -> Dict:
        """Make HTTP request to API"""
        url = f'{self.base_url}{endpoint}'
        
        try:
            response = self.session.request(
                method=method,
                url=url,
                params=params,
                json=data,
                timeout=self.timeout,
            )
            
            if response.status_code == 401:
                raise XaseAuthError('Invalid API key')
            elif response.status_code == 404:
                raise XaseNotFoundError('Resource not found')
            elif response.status_code >= 400:
                error_data = response.json() if response.content else {}
                raise XaseAPIError(
                    error_data.get('error', 'API request failed'),
                    status_code=response.status_code,
                    response=error_data,
                )
            
            return response.json() if response.content else {}
            
        except requests.exceptions.RequestException as e:
            raise XaseAPIError(f'Request failed: {str(e)}')
    
    # ==================== Datasets ====================
    
    def list_datasets(
        self,
        page: int = 1,
        limit: int = 20,
        data_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List all datasets
        
        Args:
            page: Page number (default: 1)
            limit: Items per page (default: 20)
            data_type: Filter by data type (optional)
            
        Returns:
            Dict with 'datasets' and 'total' keys
        """
        params = {'page': page, 'limit': limit}
        if data_type:
            params['dataType'] = data_type
            
        return self._request('GET', '/api/datasets', params=params)
    
    def get_dataset(self, dataset_id: str) -> Dataset:
        """
        Get dataset by ID
        
        Args:
            dataset_id: Dataset ID
            
        Returns:
            Dataset object
        """
        data = self._request('GET', f'/api/datasets/{dataset_id}')
        return Dataset(**data)
    
    def create_dataset(
        self,
        name: str,
        data_type: str,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> Dataset:
        """
        Create new dataset
        
        Args:
            name: Dataset name
            data_type: Data type (AUDIO, TEXT, IMAGE, VIDEO, DICOM, TABULAR)
            description: Optional description
            tags: Optional tags
            
        Returns:
            Created dataset
        """
        data = {
            'name': name,
            'dataType': data_type,
        }
        if description:
            data['description'] = description
        if tags:
            data['tags'] = tags
            
        result = self._request('POST', '/api/datasets', data=data)
        return Dataset(**result)
    
    def update_dataset(
        self,
        dataset_id: str,
        **kwargs,
    ) -> Dataset:
        """
        Update dataset
        
        Args:
            dataset_id: Dataset ID
            **kwargs: Fields to update
            
        Returns:
            Updated dataset
        """
        result = self._request('PATCH', f'/api/datasets/{dataset_id}', data=kwargs)
        return Dataset(**result)
    
    def delete_dataset(self, dataset_id: str) -> None:
        """
        Delete dataset
        
        Args:
            dataset_id: Dataset ID
        """
        self._request('DELETE', f'/api/datasets/{dataset_id}')
    
    # ==================== Leases ====================
    
    def create_lease(
        self,
        dataset_id: str,
        duration: Optional[int] = None,
        purpose: Optional[str] = None,
    ) -> Lease:
        """
        Create lease for dataset access
        
        Args:
            dataset_id: Dataset ID
            duration: Lease duration in seconds (optional)
            purpose: Access purpose (optional)
            
        Returns:
            Created lease with access token
        """
        data = {'datasetId': dataset_id}
        if duration:
            data['duration'] = duration
        if purpose:
            data['purpose'] = purpose
            
        result = self._request('POST', '/api/leases', data=data)
        return Lease(**result)
    
    def get_lease(self, lease_id: str) -> Lease:
        """
        Get lease by ID
        
        Args:
            lease_id: Lease ID
            
        Returns:
            Lease object
        """
        data = self._request('GET', f'/api/leases/{lease_id}')
        return Lease(**data)
    
    def list_leases(
        self,
        page: int = 1,
        limit: int = 20,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List all leases
        
        Args:
            page: Page number
            limit: Items per page
            status: Filter by status (ACTIVE, EXPIRED, REVOKED)
            
        Returns:
            Dict with 'leases' and 'total' keys
        """
        params = {'page': page, 'limit': limit}
        if status:
            params['status'] = status
            
        return self._request('GET', '/api/leases', params=params)
    
    def revoke_lease(self, lease_id: str) -> None:
        """
        Revoke lease
        
        Args:
            lease_id: Lease ID
        """
        self._request('POST', f'/api/leases/{lease_id}/revoke')
    
    def renew_lease(self, lease_id: str, duration: Optional[int] = None) -> Lease:
        """
        Renew lease
        
        Args:
            lease_id: Lease ID
            duration: New duration in seconds (optional)
            
        Returns:
            Renewed lease
        """
        data = {}
        if duration:
            data['duration'] = duration
            
        result = self._request('POST', f'/api/leases/{lease_id}/renew', data=data)
        return Lease(**result)
    
    # ==================== Policies ====================
    
    def create_policy(
        self,
        name: str,
        dataset_id: str,
        rules: Dict[str, Any],
    ) -> Policy:
        """
        Create access policy
        
        Args:
            name: Policy name
            dataset_id: Dataset ID
            rules: Policy rules dict
            
        Returns:
            Created policy
        """
        data = {
            'name': name,
            'datasetId': dataset_id,
            'rules': rules,
        }
        result = self._request('POST', '/api/policies', data=data)
        return Policy(**result)
    
    def get_policy(self, policy_id: str) -> Policy:
        """Get policy by ID"""
        data = self._request('GET', f'/api/policies/{policy_id}')
        return Policy(**data)
    
    def list_policies(
        self,
        dataset_id: Optional[str] = None,
        active: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """List policies"""
        params = {}
        if dataset_id:
            params['datasetId'] = dataset_id
        if active is not None:
            params['active'] = active
            
        return self._request('GET', '/api/policies', params=params)
    
    def update_policy(self, policy_id: str, **kwargs) -> Policy:
        """Update policy"""
        result = self._request('PATCH', f'/api/policies/{policy_id}', data=kwargs)
        return Policy(**result)
    
    def delete_policy(self, policy_id: str) -> None:
        """Delete policy"""
        self._request('DELETE', f'/api/policies/{policy_id}')
    
    # ==================== Usage Tracking ====================
    
    def record_usage(
        self,
        lease_id: str,
        bytes_transferred: int,
        records_accessed: int,
    ) -> None:
        """
        Record usage for billing
        
        Args:
            lease_id: Lease ID
            bytes_transferred: Bytes transferred
            records_accessed: Number of records accessed
        """
        data = {
            'leaseId': lease_id,
            'bytesTransferred': bytes_transferred,
            'recordsAccessed': records_accessed,
        }
        self._request('POST', '/api/billing/usage', data=data)
    
    def get_usage(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> List[Usage]:
        """
        Get usage statistics
        
        Args:
            start_date: Start date (ISO format)
            end_date: End date (ISO format)
            
        Returns:
            List of usage records
        """
        params = {}
        if start_date:
            params['startDate'] = start_date
        if end_date:
            params['endDate'] = end_date
            
        data = self._request('GET', '/api/billing/usage', params=params)
        return [Usage(**item) for item in data]
    
    # ==================== Marketplace ====================
    
    def list_offers(
        self,
        page: int = 1,
        limit: int = 20,
        data_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List marketplace offers"""
        params = {'page': page, 'limit': limit}
        if data_type:
            params['dataType'] = data_type
            
        return self._request('GET', '/api/marketplace/offers', params=params)
    
    def get_offer(self, offer_id: str) -> Offer:
        """Get offer details"""
        data = self._request('GET', f'/api/marketplace/offers/{offer_id}')
        return Offer(**data)
    
    def request_access(self, offer_id: str, purpose: str) -> AccessRequest:
        """
        Request access to dataset
        
        Args:
            offer_id: Offer ID
            purpose: Access purpose
            
        Returns:
            Access request
        """
        data = {'offerId': offer_id, 'purpose': purpose}
        result = self._request('POST', '/api/marketplace/request', data=data)
        return AccessRequest(**result)
    
    def search_marketplace(self, query: str, **kwargs) -> Dict[str, Any]:
        """
        Search marketplace
        
        Args:
            query: Search query
            **kwargs: Additional filters
            
        Returns:
            Search results
        """
        params = {'q': query, **kwargs}
        return self._request('GET', '/api/marketplace/search', params=params)
    
    # ==================== Webhooks ====================
    
    def create_webhook(
        self,
        url: str,
        events: List[str],
        secret: Optional[str] = None,
    ) -> Webhook:
        """
        Create webhook
        
        Args:
            url: Webhook URL
            events: List of event types
            secret: Optional webhook secret
            
        Returns:
            Created webhook
        """
        data = {'url': url, 'events': events}
        if secret:
            data['secret'] = secret
            
        result = self._request('POST', '/api/webhooks', data=data)
        return Webhook(**result)
    
    def list_webhooks(self) -> List[Webhook]:
        """List all webhooks"""
        data = self._request('GET', '/api/webhooks')
        return [Webhook(**item) for item in data]
    
    def delete_webhook(self, webhook_id: str) -> None:
        """Delete webhook"""
        self._request('DELETE', f'/api/webhooks/{webhook_id}')
    
    # ==================== Health & Status ====================
    
    def health(self) -> Dict[str, Any]:
        """
        Check API health
        
        Returns:
            Health status
        """
        return self._request('GET', '/api/health')
    
    def __enter__(self):
        """Context manager entry"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.session.close()
