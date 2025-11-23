import React, { useMemo } from 'react';
import { Download, Eye, MessageSquare, History, FileText, Palette, Shield, Users, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { GeneratedDocument } from '../lib/documentService';

interface DocumentHistoryProps {
  documents: GeneratedDocument[];
  loading?: boolean;
  onView: (doc: GeneratedDocument) => void;
  onDownload?: (doc: GeneratedDocument) => void;
  onBackToChat?: () => void;
}

const DocumentHistory: React.FC<DocumentHistoryProps> = ({
  documents,
  loading = false,
  onView,
  onBackToChat
}) => {
  const getIcon = (type: string) => {
    const map: Record<string, any> = {
      registration: FileText,
      branding: Palette,
      compliance: Shield,
      hr: Users
    };
    return map[type] || FileText;
  };

  const getColor = (type: string) => {
    const map: Record<string, string> = {
      registration: 'from-blue-600 to-blue-700',
      branding: 'from-purple-600 to-purple-700',
      compliance: 'from-green-600 to-green-700',
      hr: 'from-orange-600 to-orange-700'
    };
    return map[type] || 'from-gray-600 to-gray-700';
  };

  // Define document type order for sorting
  const getDocumentTypeOrder = (type: string): number => {
    const order: Record<string, number> = {
      'registration': 1,
      'compliance': 2,
      'hr': 3,
      'branding': 4
    };
    return order[type] || 99; // Unknown types go to the end
  };

  // Group documents by business_name
  const groupedDocuments = useMemo(() => {
    const groups: Record<string, GeneratedDocument[]> = {};
    
    documents.forEach(doc => {
      const businessName = doc.business_name || 'Unnamed Business';
      if (!groups[businessName]) {
        groups[businessName] = [];
      }
      groups[businessName].push(doc);
    });

    // Sort documents within each group by document type order (Registration, Compliance, HR, Branding)
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => {
        const orderA = getDocumentTypeOrder(a.document_type);
        const orderB = getDocumentTypeOrder(b.document_type);
        // If same type, sort by created_at (most recent first)
        if (orderA === orderB) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        return orderA - orderB;
      });
    });

    return groups;
  }, [documents]);

  const handleDownload = async (doc: GeneratedDocument) => {
    // If we have pdf_file_name but no pdf_url, download directly from storage
    if (doc.pdf_file_name && !doc.pdf_url) {
      try {
        const { data, error } = await supabase.storage
          .from('business-documents')
          .download(doc.pdf_file_name);
        
        if (error) {
          console.error('Error downloading from Supabase storage:', error);
          return;
        }
        
        const blob = data;
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        const fileName = doc.pdf_file_name.split('/').pop() || `${doc.document_title.replace(/\s+/g, '_')}.pdf`;
        link.download = fileName;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        return;
      } catch (error) {
        console.error('Error downloading PDF:', error);
        return;
      }
    }
    
    // If we have pdf_url, use the existing logic
    if (!doc.pdf_url) return;
    
    try {
      let blob: Blob;
      
      // Check if it's a Supabase storage URL
      if (doc.pdf_url.includes('supabase') && doc.pdf_file_name) {
        // Use Supabase client to download (handles authentication)
        const { data, error } = await supabase.storage
          .from('business-documents')
          .download(doc.pdf_file_name);
        
        if (error) {
          console.error('Error downloading from Supabase storage:', error);
          throw error;
        }
        
        blob = data;
      } else {
        // Regular HTTP fetch for public URLs
        const response = await fetch(doc.pdf_url);
        if (!response.ok) throw new Error('Failed to fetch PDF');
        blob = await response.blob();
      }
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Use pdf_file_name if available, otherwise generate a name
      const fileName = doc.pdf_file_name 
        ? doc.pdf_file_name.split('/').pop() || `${doc.document_title.replace(/\s+/g, '_')}.pdf`
        : `${doc.document_title.replace(/\s+/g, '_')}.pdf`;
      link.download = fileName;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      // Fallback: open in new tab if download fails
      if (doc.pdf_url) {
        window.open(doc.pdf_url, '_blank');
      }
    }
  };

  return (
    <div className="p-6 space-y-6">
      {onBackToChat && (
        <div className="flex justify-start mb-4">
          <button
            onClick={onBackToChat}
            className="flex items-center space-x-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 border border-gray-700 hover:border-gray-600"
          >
            <MessageSquare className="h-4 w-4" />
            <span>Back to Chat</span>
          </button>
        </div>
      )}

      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2 flex items-center justify-center space-x-2">
          <History className="h-7 w-7" />
          <span>Document History</span>
        </h2>
        <p className="text-gray-400">View documents from your previous sessions.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-gray-400">Loading your history...</span>
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          No documents found yet.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedDocuments).map(([businessName, businessDocs]) => (
            <div key={businessName} className="space-y-4">
              {/* Business Name Header */}
              <div className="flex items-center space-x-2 mb-4">
                <Building2 className="h-5 w-5 text-blue-400" />
                <h3 className="text-xl font-semibold text-white">{businessName}</h3>
                <span className="text-gray-500 text-sm">({businessDocs.length} document{businessDocs.length !== 1 ? 's' : ''})</span>
              </div>

              {/* Documents Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {businessDocs.map((doc) => {
                  const Icon = getIcon(doc.document_type);
                  const color = getColor(doc.document_type);
                  const created = new Date(doc.created_at);
                  return (
                    <div key={doc.id} className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-gray-600 transition-all duration-200">
                      <div className={`bg-gradient-to-r ${color} p-4`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3 flex-1">
                            <div className="bg-white/20 rounded-lg p-2">
                              <Icon className="h-6 w-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-xl font-semibold text-white truncate">{doc.document_title}</h3>
                              <p className="text-white/80 text-xs">{doc.document_type.toUpperCase()} • {created.toLocaleString()}</p>
                            </div>
                          </div>
                          
                          {/* View and Download Icons */}
                          <div className="flex items-center space-x-2 ml-3">
                            <button
                              onClick={() => onView(doc)}
                              className="bg-white/20 hover:bg-white/30 rounded-lg p-2 transition-colors duration-200"
                              title="View Document"
                            >
                              <Eye className="h-5 w-5 text-white" />
                            </button>
                            {/* Show download button if pdf_url exists OR pdf_file_name exists */}
                            {(doc.pdf_url || doc.pdf_file_name) && (
                              <button
                                onClick={() => handleDownload(doc)}
                                className="bg-white/20 hover:bg-white/30 rounded-lg p-2 transition-colors duration-200"
                                title="Download PDF"
                              >
                                <Download className="h-5 w-5 text-white" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentHistory;



