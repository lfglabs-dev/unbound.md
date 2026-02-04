'use client';

import { useEffect, useState } from 'react';

interface ServiceRequest {
  id: string;
  service: string;
  service_type?: string;
  params: any;
  contact: any;
  estimated_quote?: any;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Negotiation {
  id: string;
  request_id: string;
  action: string;
  from_agent: string;
  offer?: any;
  message?: string;
  created_at: string;
}

export default function AdminDashboard() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbInitialized, setDbInitialized] = useState(false);

  useEffect(() => {
    loadRequests();
  }, []);

  const initializeDatabase = async () => {
    try {
      const response = await fetch('/api/db/init');
      const data = await response.json();
      if (data.success) {
        setDbInitialized(true);
        alert('Database initialized successfully!');
        loadRequests();
      } else {
        alert('Failed to initialize database: ' + data.error);
      }
    } catch (error) {
      console.error('Error initializing database:', error);
      alert('Error initializing database');
    }
  };

  const loadRequests = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/requests');
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadNegotiations = async (requestId: string) => {
    try {
      const response = await fetch(`/api/admin/negotiations?request_id=${requestId}`);
      if (response.ok) {
        const data = await response.json();
        setNegotiations(data.negotiations || []);
      }
    } catch (error) {
      console.error('Error loading negotiations:', error);
    }
  };

  const selectRequest = (request: ServiceRequest) => {
    setSelectedRequest(request);
    loadNegotiations(request.id);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      quoted: 'bg-blue-100 text-blue-800',
      paid: 'bg-green-100 text-green-800',
      in_progress: 'bg-purple-100 text-purple-800',
      completed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">unbound.md Admin Dashboard</h1>
          <div className="space-x-2">
            <button
              onClick={initializeDatabase}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Initialize Database
            </button>
            <button
              onClick={loadRequests}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Requests List */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Service Requests ({requests.length})</h2>
              <div className="space-y-3">
                {requests.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">
                    No requests yet. Initialize database if not already done.
                  </div>
                ) : (
                  requests.map((request) => (
                    <div
                      key={request.id}
                      onClick={() => selectRequest(request)}
                      className={`p-4 border rounded cursor-pointer hover:bg-gray-50 ${
                        selectedRequest?.id === request.id ? 'border-blue-500 bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-semibold">{request.service}</h3>
                          {request.service_type && (
                            <p className="text-sm text-gray-600">{request.service_type}</p>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded text-xs ${getStatusColor(request.status)}`}>
                          {request.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        {new Date(request.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Request Details */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Request Details</h2>
              {selectedRequest ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-gray-700">ID</h3>
                    <p className="text-sm font-mono">{selectedRequest.id}</p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-700">Service</h3>
                    <p>{selectedRequest.service} {selectedRequest.service_type && `(${selectedRequest.service_type})`}</p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-700">Parameters</h3>
                    <pre className="text-sm bg-gray-50 p-2 rounded overflow-auto">
                      {JSON.stringify(selectedRequest.params, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-700">Contact</h3>
                    <pre className="text-sm bg-gray-50 p-2 rounded overflow-auto">
                      {JSON.stringify(selectedRequest.contact, null, 2)}
                    </pre>
                  </div>

                  {selectedRequest.estimated_quote && (
                    <div>
                      <h3 className="font-semibold text-gray-700">Quote</h3>
                      <pre className="text-sm bg-gray-50 p-2 rounded overflow-auto">
                        {JSON.stringify(selectedRequest.estimated_quote, null, 2)}
                      </pre>
                    </div>
                  )}

                  <div>
                    <h3 className="font-semibold text-gray-700 mb-2">Negotiations ({negotiations.length})</h3>
                    {negotiations.length === 0 ? (
                      <p className="text-sm text-gray-500">No negotiations yet</p>
                    ) : (
                      <div className="space-y-2">
                        {negotiations.map((neg) => (
                          <div key={neg.id} className="border-l-4 border-blue-500 pl-3 py-2">
                            <p className="text-sm font-semibold">{neg.action} by {neg.from_agent}</p>
                            {neg.message && <p className="text-sm text-gray-600">{neg.message}</p>}
                            {neg.offer && (
                              <pre className="text-xs bg-gray-50 p-1 mt-1 rounded">
                                {JSON.stringify(neg.offer, null, 2)}
                              </pre>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(neg.created_at).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-gray-500 text-center py-12">
                  Select a request to view details
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
