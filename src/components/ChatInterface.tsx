import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Phone, Mail, FileCheck, History, Loader2, FileText, Palette, Shield, Users, CheckCircle2, Star } from 'lucide-react';
import { auth } from '../lib/auth';
import { submitRating, getMentorForService } from '../lib/rating';
import { createSession, saveChatMessage, updateSessionStatus } from '../lib/session';
import { supabase } from '../lib/supabase';
import { getDocumentsBySession, getDocumentsByUser, type GeneratedDocument } from '../lib/documentService';
import { fetchActiveMentors, type MentorProfile } from '../lib/mentors';
import DocumentDashboard from './DocumentDashboard';
import DocumentViewer from './DocumentViewer';
import DocumentHistory from './DocumentHistory';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  mentorCard?: {
    name: string;
    email: string;
    phone: string;
    expertise: string;
  };
  mentorCards?: Array<{
    name: string;
    email: string;
    phone: string;
    expertise: string;
    service: string;
  }>;
}

interface Document {
  id: string;
  type: 'registration' | 'branding' | 'compliance' | 'hr';
  title: string;
  keyPoints: string[];
  fullContent: string;
  pdfUrl?: string;
  status: 'generating' | 'completed' | 'failed';
}

interface ChatInterfaceProps {
  onNavigate?: (page: string) => void;
}

type ViewMode = 'chat' | 'dashboard' | 'document' | 'history' | 'mentors';
type FlowStage = 'initial' | 'questioning' | 'generating' | 'documents' | 'rating';

// Document Generation Loader Component
interface DocumentGenerationLoaderProps {
  documents: Document[];
}

const DocumentGenerationLoader: React.FC<DocumentGenerationLoaderProps> = ({ documents }) => {
  const documentTypes = [
    { type: 'registration', label: 'Registration Guide', icon: FileText, color: 'text-blue-400' },
    { type: 'compliance', label: 'Compliance Guide', icon: Shield, color: 'text-green-400' },
    { type: 'hr', label: 'HR Setup Guide', icon: Users, color: 'text-orange-400' },
    { type: 'branding', label: 'Branding Guide', icon: Palette, color: 'text-purple-400' }
  ];

  const getDocumentStatus = (type: string) => {
    const doc = documents.find(d => d.type === type);
    if (!doc) return 'pending';
    return doc.status;
  };

  // Count completed documents
  const completedCount = documents.filter(doc => doc.status === 'completed').length;
  const totalCount = documentTypes.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-300">Generating Documents:</p>
        <p className="text-xs text-gray-400">
          {completedCount}/{totalCount} completed
        </p>
      </div>
      {documentTypes.map(({ type, label, icon: Icon, color }) => {
        const status = getDocumentStatus(type);
        const isGenerating = status === 'generating';
        const isCompleted = status === 'completed';
        const isFailed = status === 'failed';
        const isPending = status === 'pending';

        return (
          <div 
            key={type} 
            className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 ${
              isGenerating 
                ? 'bg-blue-500/10 border border-blue-500/20' 
                : isCompleted
                ? 'bg-green-500/10 border border-green-500/20'
                : isFailed
                ? 'bg-red-500/10 border border-red-500/20'
                : 'bg-gray-700/50 border border-gray-600/50'
            }`}
          >
            <div className={`flex-shrink-0 ${color} ${isGenerating ? 'animate-pulse' : ''}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className={`text-sm ${
                isCompleted ? 'text-green-300' : 
                isFailed ? 'text-red-300' : 
                isGenerating ? 'text-blue-300' : 
                'text-gray-200'
              }`}>
                {label}
              </p>
              {isGenerating && (
                <p className="text-xs text-gray-400 mt-1">Creating content...</p>
              )}
            </div>
            <div className="flex-shrink-0">
              {isGenerating && (
                <div className="relative">
                  <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                  <div className="absolute inset-0 border-2 border-blue-400/20 rounded-full animate-ping" />
                </div>
              )}
              {isCompleted && (
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              )}
              {isFailed && (
                <div className="h-5 w-5 rounded-full bg-red-500 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
              )}
              {isPending && (
                <div className="h-5 w-5 rounded-full bg-gray-600 animate-pulse" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const QUESTIONS = [
  { id: 1, field: 'business_name', prompt: 'What is the company name or preferred company name?' },
  { id: 2, field: 'company_description', prompt: 'Please provide a brief description of the company or company website' },
  { id: 3, field: 'location', prompt: 'Which location will the business operate in?' },
  { id: 4, field: 'partners_info', prompt: 'Who will be the partners or directors? (How many and their roles?)' },
  { id: 5, field: 'color_preference', prompt: 'What color tone would you prefer for branding? (Earthy, Bright, Professional, etc.)' },
  { id: 6, field: 'style_preference', prompt: 'What style would you prefer? (Conservative/Classic, Modern/Contemporary, Expressive/Bold)' }
];

const ChatInterface = ({ onNavigate }: ChatInterfaceProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');

  // New state for sequential flow
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [flowStage, setFlowStage] = useState<FlowStage>('initial');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [businessProfile, setBusinessProfile] = useState<any>({});
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [awaitingRating, setAwaitingRating] = useState(false);
  const [ratingFeedback, setRatingFeedback] = useState<string>('');
  const [historyDocs, setHistoryDocs] = useState<GeneratedDocument[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [mentors, setMentors] = useState<MentorProfile[]>([]);
  const [mentorsLoading, setMentorsLoading] = useState<boolean>(false);
  const [mentorsError, setMentorsError] = useState<string | null>(null);
  const [hasGeneratedDocuments, setHasGeneratedDocuments] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Scroll to bottom when documents status changes (for loader visibility)
  useEffect(() => {
    if ((flowStage === 'generating' || flowStage === 'documents') && 
        documents.some(doc => doc.status === 'generating')) {
      scrollToBottom();
    }
  }, [documents, flowStage]);

  useEffect(() => {
    initializeChat();
  }, []);

  useEffect(() => {
    if (currentUser?.id) {
      checkUserHasDocuments(currentUser.id);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentSessionId && (viewMode === 'dashboard' || viewMode === 'document')) {
      loadDocumentsFromDatabase();
    }
  }, [currentSessionId, viewMode]);

  const initializeChat = async () => {
    try {
      console.log('Initializing chat...');

      const user = await auth.getCurrentUser();
      if (!user) {
        console.log('No authenticated user found, redirecting to login');
        if (onNavigate) {
          onNavigate('login');
        }
        return;
      }

      console.log('User authenticated:', user.id);
      setCurrentUser(user);

      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) {
        console.error('No active auth session found, redirecting to login');
        if (onNavigate) {
          onNavigate('login');
        }
        return;
      }

      console.log('Auth session verified, access token present:', !!authSession.access_token);

      console.log('Creating initial session for user:', user.id);
      const session = await createSession(user.id, 'chat_session');
      if (session) {
        setCurrentSessionId(session);
        console.log('Initial session created successfully:', session);
      } else {
        console.error('Failed to create initial session');
        const errorMessage: Message = {
          id: 'error-1',
          type: 'ai',
          content: 'We encountered an issue starting your session. This may be due to a database connection problem. Please try refreshing the page. If the issue persists, please log out and log back in.',
          timestamp: new Date()
        };
        setMessages([errorMessage]);
        return;
      }

      // Show initial welcome message
      const welcomeMessage: Message = {
        id: '1',
        type: 'ai',
        content: 'Welcome to StartUP Companion! I\'m here to help you launch your business.\n\nPlease choose an option:\n\n1. Idea Tuning - My idea is not firmed up yet\n2. Confirmed Idea - I\'m ready to get my business documents\n\nJust type the number (1 or 2) to get started!',
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);

      // Save welcome message to database
      if (session && user) {
        await saveChatMessage(session, user.id, 'ai', welcomeMessage.content);
      }
    } catch (error) {
      console.error('Failed to initialize chat:', error);
      if (onNavigate) {
        onNavigate('login');
      }
    }
  };

  const checkUserHasDocuments = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('generated_documents')
        .select('id')
        .eq('user_id', userId)
        .eq('generation_status', 'completed')
        .limit(1);

      if (error) {
        console.error('Error checking generated documents:', error);
        setHasGeneratedDocuments(false);
        return;
      }

      setHasGeneratedDocuments(!!data && data.length > 0);
    } catch (err) {
      console.error('Unexpected error checking generated documents:', err);
      setHasGeneratedDocuments(false);
    }
  };

  const loadMentors = async () => {
    setMentorsError(null);
    setMentorsLoading(true);
    const { mentors: mentorProfiles, error } = await fetchActiveMentors();
    setMentors(mentorProfiles);
    if (error) {
      setMentorsError('Unable to load mentors right now. Please try again.');
    } else if (mentorProfiles.length === 0) {
      setMentorsError('We will be onboarding mentors shortly. Please check back soon.');
    }
    setMentorsLoading(false);
  };

  useEffect(() => {
    if (viewMode === 'mentors') {
      loadMentors();
    }
  }, [viewMode]);


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const addMessageAndSave = async (message: Message) => {
    setMessages(prev => [...prev, message]);

    // Save to database if we have a session
    if (currentSessionId && currentUser) {
      const saved = await saveChatMessage(
        currentSessionId,
        currentUser.id,
        message.type,
        message.content
      );
      if (!saved) {
        console.error('Failed to save message to database:', message.content.substring(0, 50));
      }
    } else {
      console.warn('Cannot save message: missing session or user', {
        hasSession: !!currentSessionId,
        hasUser: !!currentUser,
        messagePreview: message.content.substring(0, 50)
      });
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputText,
      timestamp: new Date()
    };

    await addMessageAndSave(userMessage);
    const userInput = inputText;
    setInputText('');

    // Handle different stages
    if (flowStage === 'initial') {
      await handleInitialChoice(userInput);
    } else if (flowStage === 'questioning') {
      await handleQuestionResponse(userInput);
    } else if (flowStage === 'rating') {
      await handleRatingResponse(userInput);
    }
  };

  const handleInitialChoice = async (userInput: string) => {
    const choice = userInput.trim();

    if (choice === '1') {
      // Idea Tuning - placeholder
      const aiMessage: Message = {
        id: Date.now().toString(),
        type: 'ai',
        content: 'Idea Tuning service will be available soon! This feature will help you refine and validate your business concept.\n\nFor now, if you have a confirmed idea, please type "2" to proceed with document generation.',
        timestamp: new Date()
      };
      await addMessageAndSave(aiMessage);
    } else if (choice === '2') {
      // Confirmed Idea - start questioning flow
      if (currentSessionId) {
        console.log('Updating session to confirmed_idea_flow:', currentSessionId);
        const { error } = await supabase
          .from('user_sessions')
          .update({
            service_type: 'confirmed_idea_flow',
            updated_at: new Date().toISOString()
          })
          .eq('id', currentSessionId);

        if (error) {
          console.error('Failed to update session type:', error);
          console.error('Error details:', {
            message: error.message,
            details: error.details,
            hint: error.hint
          });
        }
      }

      // Reset business profile state for new flow
      setBusinessProfile({});
      setCurrentQuestionIndex(0);

      setFlowStage('questioning');
      const aiMessage: Message = {
        id: Date.now().toString(),
        type: 'ai',
        content: `Great! I'll ask you 6 quick questions to gather the information we need.\n\nQuestion 1 of 6:\n${QUESTIONS[0].prompt}`,
        timestamp: new Date()
      };
      await addMessageAndSave(aiMessage);
    } else {
      const aiMessage: Message = {
        id: Date.now().toString(),
        type: 'ai',
        content: 'Please type 1 for Idea Tuning or 2 for Confirmed Idea to proceed.',
        timestamp: new Date()
      };
      await addMessageAndSave(aiMessage);
    }
  };

  const handleQuestionResponse = async (userInput: string) => {
    const currentQuestion = QUESTIONS[currentQuestionIndex];

    // Store answer in business profile
    const updatedProfile = { ...businessProfile };

    if (currentQuestion.field === 'partners_info') {
      // Parse partners information
      updatedProfile[currentQuestion.field] = [{ info: userInput }];
    } else {
      updatedProfile[currentQuestion.field] = userInput;
    }

    setBusinessProfile(updatedProfile);

    // Save to database
    console.log(`Saving answer for question ${currentQuestionIndex + 1}:`, currentQuestion.field);
    const saved = await updateBusinessProfile(updatedProfile);

    if (!saved) {
      console.error('Failed to save business profile to database');
      const errorMessage: Message = {
        id: Date.now().toString(),
        type: 'ai',
        content: 'Sorry, there was an error saving your response. Please try again or refresh the page.',
        timestamp: new Date()
      };
      await addMessageAndSave(errorMessage);
      return;
    }

    // Show confirmation and next question
    if (currentQuestionIndex < QUESTIONS.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);

      const aiMessage: Message = {
        id: Date.now().toString(),
        type: 'ai',
        content: `Got it!\n\nQuestion ${nextIndex + 1} of 6:\n${QUESTIONS[nextIndex].prompt}`,
        timestamp: new Date()
      };
      await addMessageAndSave(aiMessage);
    } else {
      // All questions answered - start generation
      console.log('All questions answered. Final profile:', updatedProfile);
      setFlowStage('generating');
      const aiMessage: Message = {
        id: Date.now().toString(),
        type: 'ai',
        content: 'Perfect! I have all the information I need.\n\nProcessing your information and generating your business documents...\n\nThis may take a few moments. Please wait.',
        timestamp: new Date()
      };
      await addMessageAndSave(aiMessage);

      // Small delay to ensure database is updated
      await new Promise(resolve => setTimeout(resolve, 500));

      // Trigger document generation
      await generateAllDocuments();
    }
  };

  const updateBusinessProfile = async (profile: any): Promise<boolean> => {
    if (!currentUser || !currentSessionId) {
      console.error('Cannot update profile: missing user or session', {
        hasUser: !!currentUser,
        hasSession: !!currentSessionId,
        userId: currentUser?.id,
        sessionId: currentSessionId
      });
      return false;
    }

    try {
      console.log('Updating business profile for session:', currentSessionId);
      console.log('Profile data to save:', profile);

      const { data: existingProfile, error: selectError } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('session_id', currentSessionId)
        .maybeSingle();

      if (selectError) {
        console.error('Error checking existing profile:', selectError);
        return false;
      }

      if (existingProfile) {
        console.log('Found existing profile, updating...');
        const mergedProfile: any = { ...existingProfile };

        Object.keys(profile).forEach(key => {
          if (profile[key] !== undefined && profile[key] !== null && profile[key] !== '') {
            mergedProfile[key] = profile[key];
          }
        });

        console.log('Merged profile data:', mergedProfile);

        const { data: updatedData, error: updateError } = await supabase
          .from('business_profiles')
          .update(mergedProfile)
          .eq('session_id', currentSessionId)
          .select();

        if (updateError) {
          console.error('Error updating business profile:', updateError);
          return false;
        } else {
          console.log('Business profile updated successfully:', updatedData);
          return true;
        }
      } else {
        console.log('No existing profile found, creating new one...');
        const newProfile = {
          user_id: currentUser.id,
          session_id: currentSessionId,
          ...profile
        };

        console.log('New profile data:', newProfile);

        const { data: insertedData, error: insertError } = await supabase
          .from('business_profiles')
          .insert(newProfile)
          .select();

        if (insertError) {
          console.error('Error inserting business profile:', insertError);
          console.error('Insert error details:', {
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
            code: insertError.code
          });
          return false;
        } else {
          console.log('Business profile created successfully:', insertedData);
          return true;
        }
      }
    } catch (error) {
      console.error('Unexpected error updating business profile:', error);
      return false;
    }
  };

  const loadDocumentsFromDatabase = async () => {
    if (!currentSessionId) {
      console.log('No session ID available for loading documents');
      return;
    }

    try {
      console.log('Loading documents from database for session:', currentSessionId);
      const dbDocuments = await getDocumentsBySession(currentSessionId);
      console.log('Loaded documents from database:', dbDocuments);

      const formattedDocs: Document[] = dbDocuments.map(doc => ({
        id: doc.id,
        type: doc.document_type,
        title: doc.document_title,
        keyPoints: Array.isArray(doc.key_points) ? doc.key_points : [],
        fullContent: doc.full_content || '',
        pdfUrl: doc.pdf_url || undefined,
        status: doc.generation_status
      }));

      setDocuments(formattedDocs);
      if (formattedDocs.length > 0) {
        setHasGeneratedDocuments(true);
      }
    } catch (error) {
      console.error('Error loading documents from database:', error);
    }
  };

  const generateAllDocuments = async () => {
    // Validate that we have the required data before generation
    console.log('Starting document generation validation...');
    console.log('Session ID:', currentSessionId);
    console.log('User ID:', currentUser?.id);
    console.log('Business Profile State:', businessProfile);

    if (!currentSessionId || !currentUser) {
      console.error('Cannot generate documents: missing session or user');
      const errorMessage: Message = {
        id: Date.now().toString(),
        type: 'ai',
        content: 'Sorry, there was an error. Please refresh the page and try again.',
        timestamp: new Date()
      };
      await addMessageAndSave(errorMessage);
      return;
    }

    // Verify business profile exists in database
    const { data: dbProfile, error: profileError } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('session_id', currentSessionId)
      .maybeSingle();

    console.log('Database profile check:', { dbProfile, profileError });

    if (profileError) {
      console.error('Error fetching business profile:', profileError);
      const errorMessage: Message = {
        id: Date.now().toString(),
        type: 'ai',
        content: 'Sorry, we encountered an error retrieving your business information. Please try again.',
        timestamp: new Date()
      };
      await addMessageAndSave(errorMessage);
      return;
    }

    if (!dbProfile) {
      console.error('No business profile found in database for session:', currentSessionId);
      const errorMessage: Message = {
        id: Date.now().toString(),
        type: 'ai',
        content: 'Sorry, we could not find your business information. Please start over.',
        timestamp: new Date()
      };
      await addMessageAndSave(errorMessage);
      return;
    }

    // Validate that all required fields are present
    const requiredFields = ['business_name', 'company_description', 'location', 'partners_info', 'color_preference', 'style_preference'];
    const missingFields = requiredFields.filter(field => !dbProfile[field]);

    if (missingFields.length > 0) {
      console.warn('Business profile missing fields:', missingFields);
      console.log('Current profile data:', dbProfile);
    }

    console.log('Validation passed. Starting document generation with profile:', dbProfile);

    const documentTypes = ['registration', 'branding', 'compliance', 'hr'];
    const initialDocs: Document[] = documentTypes.map(type => ({
      id: `${type}-${Date.now()}`,
      type: type as any,
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} Guide`,
      keyPoints: [],
      fullContent: '',
      status: 'generating' as const,
      progressStage: 'content' as const
    }));

    // Initialize documents and set flow stage, but KEEP user on chat interface
    setDocuments(initialDocs);
    setFlowStage('documents');
    // Keep viewMode as 'chat' - don't navigate to dashboard yet
    // User will see the progress message in chat interface

    // Call edge functions for each document type (these run in parallel)
    console.log('Starting document generation for all types...');
    const promises = documentTypes.map(type => generateDocument(type));
    await Promise.allSettled(promises);

    console.log('All document generation promises settled. Checking completion status...');

    // Poll the database to check if all documents are completed
    // This ensures we wait for documents to be fully saved to the database
    let allCompleted = false;
    let attempts = 0;
    const maxAttempts = 60; // Maximum 60 seconds wait time (1 minute)
    const pollInterval = 2000; // Check every 2 seconds

    while (!allCompleted && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      try {
        // Check database directly to see if all documents are completed
        const { data: dbDocuments, error } = await supabase
          .from('generated_documents')
          .select('document_type, generation_status')
          .eq('session_id', currentSessionId)
          .eq('user_id', currentUser.id);

        if (error) {
          console.error('Error checking document status:', error);
          attempts++;
          continue;
        }

        if (dbDocuments && dbDocuments.length >= documentTypes.length) {
          // Check if all documents are completed (not generating)
          const allDone = dbDocuments.every(doc => 
            doc.generation_status === 'completed' || doc.generation_status === 'failed'
          );
          
          if (allDone) {
            console.log('All documents completed! Loading final documents...');
            allCompleted = true;
            
            // Load the final documents from database
            await loadDocumentsFromDatabase();
            
            // Wait a moment for state to update
            await new Promise(resolve => setTimeout(resolve, 500));
            
            break;
          } else {
            // Some documents still generating, update UI with current status
            await loadDocumentsFromDatabase();
          }
        } else {
          // Not all documents created yet, continue waiting
          console.log(`Waiting for documents... (${dbDocuments?.length || 0}/${documentTypes.length} created)`);
        }
      } catch (error) {
        console.error('Error polling document status:', error);
      }

      attempts++;
    }

    if (!allCompleted) {
      console.warn('Document generation timeout - navigating to dashboard anyway');
      // Load whatever documents we have
      await loadDocumentsFromDatabase();
    }

    // All documents are generated (or timeout reached) - now navigate to dashboard
    console.log('Navigating to document dashboard...');
    setFlowStage('rating'); // Set to 'rating' stage so we can prompt for feedback when user returns to chat
    setViewMode('dashboard');
    setHasGeneratedDocuments(true);
  };

  const generateDocument = async (type: string) => {
    try {
      console.log('Generating document:', type);
      let functionName = '';
      if (type === 'registration') functionName = 'registration-guide-guru';
      else if (type === 'branding') functionName = 'branding-guide-guru';
      else if (type === 'compliance') functionName = 'compliance-guide-guru';
      else if (type === 'hr') functionName = 'hr-guide-guru';

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`;

      // Get the user's session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No active session found');
        return null;
      }

      const headers = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };

      console.log('Fetching latest profile for session:', currentSessionId);
      const { data: latestProfile } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('session_id', currentSessionId)
        .maybeSingle();

      console.log('Business profile for generation:', latestProfile);

      console.log('Calling edge function:', apiUrl);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: 'generate_document',
          sessionId: currentSessionId,
          userId: currentUser.id,
          businessProfile: latestProfile || businessProfile
        })
      });

      if (response.ok) {
        const result = await response.json();

        // Check if the response contains an error
        if (result.error || result.userMessage) {
          console.error(`Error from edge function for ${type}:`, result);
          setDocuments(prev => prev.map(doc =>
            doc.type === type ? { ...doc, status: 'failed' as const } : doc
          ));
          return;
        }

        // Validate that we have actual content
        const fullContent = result.fullContent || result.response || '';
        if (!fullContent || fullContent.length < 100) {
          console.error(`Invalid or empty content received for ${type} document`);
          setDocuments(prev => prev.map(doc =>
            doc.type === type ? { ...doc, status: 'failed' as const } : doc
          ));
          return;
        }

        // Log warning if PDF generation failed but document succeeded
        if (result.warning) {
          console.warn(`${type} document:`, result.warning);
        }

        // Update document status with valid content
        setDocuments(prev => prev.map(doc =>
          doc.type === type ? {
            ...doc,
            status: 'completed' as const,
            keyPoints: result.keyPoints || [],
            fullContent: fullContent,
            pdfUrl: result.pdfUrl
          } : doc
        ));
      } else {
        // Mark as failed for non-200 responses
        const errorData = await response.json().catch(() => ({}));
        console.error(`Failed to generate ${type} document:`, errorData);
        setDocuments(prev => prev.map(doc =>
          doc.type === type ? { ...doc, status: 'failed' as const } : doc
        ));
      }
    } catch (error) {
      console.error(`Error generating ${type} document:`, error);
      setDocuments(prev => prev.map(doc =>
        doc.type === type ? { ...doc, status: 'failed' as const } : doc
      ));
    }
  };

  const handleRatingResponse = async (userInput: string) => {
    const rating = parseInt(userInput.trim());

    if (rating >= 1 && rating <= 5) {
      setAwaitingRating(false);

      // Store rating
      await submitRating({
        user_id: currentUser?.id,
        session_id: currentSessionId,
        service_type: 'confirmed_idea_flow',
        rating: rating
      });

      const thankYouMessage: Message = {
        id: Date.now().toString(),
        type: 'ai',
        content: `Thank you for your ${rating}-star rating! ${rating >= 4 ? '🎉 We\'re glad you had a great experience!' : ''}`,
        timestamp: new Date()
      };
      await addMessageAndSave(thankYouMessage);

      if (rating <= 3) {
        setTimeout(async () => {
          const feedbackMessage: Message = {
            id: (Date.now() + 1).toString(),
            type: 'ai',
            content: 'We\'re sorry to hear that. Could you briefly tell us what went wrong or what we could improve? Your feedback helps us serve you better.',
            timestamp: new Date()
          };
          await addMessageAndSave(feedbackMessage);
          setRatingFeedback('awaiting');
        }, 1000);
      } else {
        setTimeout(async () => {
          const finalMessage: Message = {
            id: (Date.now() + 1).toString(),
            type: 'ai',
            content: 'All your documents are available in the dashboard. You can view or download them anytime. Thank you for using StartUP Companion!',
            timestamp: new Date()
          };
          await addMessageAndSave(finalMessage);

          // Update session status to completed and change flow stage
          if (currentSessionId) {
            await updateSessionStatus(currentSessionId, 'completed');
          }
          setFlowStage('documents'); // Change flow stage after rating is submitted
        }, 1500);
      }
    } else if (ratingFeedback === 'awaiting') {
      // Handle feedback
      setRatingFeedback('');

      const feedbackThankYou: Message = {
        id: Date.now().toString(),
        type: 'ai',
        content: 'Thank you for your feedback. Let us connect you with our expert mentors who can provide personalized guidance for each area of your business.',
        timestamp: new Date()
      };
      await addMessageAndSave(feedbackThankYou);

      // Get mentors for each service type
      const serviceTypes = ['registration', 'branding', 'compliance', 'hr'];
      const mentorPromises = serviceTypes.map(type => getMentorForService(type));
      const mentors = await Promise.all(mentorPromises);

      const mentorCards = mentors
        .filter(mentor => mentor !== null)
        .map((mentor, index) => ({
          name: mentor!.name,
          email: mentor!.email,
          phone: mentor!.phone || '',
          expertise: mentor!.specialization.join(', '),
          service: serviceTypes[index].charAt(0).toUpperCase() + serviceTypes[index].slice(1)
        }));

      if (mentorCards.length > 0) {
        setTimeout(async () => {
          const mentorMessage: Message = {
            id: (Date.now() + 1).toString(),
            type: 'ai',
            content: '📞 Your Recommended Mentors',
            timestamp: new Date(),
            mentorCards: mentorCards
          };
          await addMessageAndSave(mentorMessage);

          // Update session status to completed and change flow stage
          if (currentSessionId) {
            await updateSessionStatus(currentSessionId, 'completed');
          }
          setFlowStage('documents'); // Change flow stage after feedback is submitted
        }, 1500);
      } else {
        // No mentors found, still update flow stage
        setFlowStage('documents');
      }
    } else {
      const errorMessage: Message = {
        id: Date.now().toString(),
        type: 'ai',
        content: 'Please provide a valid rating between 1 and 5.',
        timestamp: new Date()
      };
      await addMessageAndSave(errorMessage);
    }
  };

  const handleViewDocument = (doc: Document) => {
    setSelectedDocument(doc);
    setViewMode('document');
  };

  const handleDownloadPdf = (doc: Document) => {
    if (doc.pdfUrl) {
      window.open(doc.pdfUrl, '_blank');
    }
  };

  const handleBackToDashboard = () => {
    setSelectedDocument(null);
    setViewMode('dashboard');
  };

  const handleBackToChat = async () => {
    setViewMode('chat');
    
    // If we're in the rating stage, check if we need to show the rating prompt
    if (flowStage === 'rating') {
      // Check if rating has already been submitted for this session
      let ratingSubmitted = false;
      if (currentSessionId && currentUser?.id) {
        try {
          const { data: existingRating } = await supabase
            .from('service_ratings')
            .select('id')
            .eq('session_id', currentSessionId)
            .eq('user_id', currentUser.id)
            .eq('service_type', 'confirmed_idea_flow')
            .maybeSingle();
          
          ratingSubmitted = !!existingRating;
        } catch (error) {
          console.error('Error checking for existing rating:', error);
        }
      }
      
      // Only show rating prompt if rating hasn't been submitted yet
      if (!ratingSubmitted) {
        // Check if rating message already exists in messages
        const hasRatingMessage = messages.some(msg => 
          msg.type === 'ai' && msg.content.includes('How would you rate your experience?')
        );
        
        if (!hasRatingMessage) {
          const ratingMessage: Message = {
            id: Date.now().toString(),
            type: 'ai',
            content: '🎉 All your business documents have been generated!\n\nYou can view them in the document dashboard.\n\nHow would you rate your experience?\n\nPlease type a number from 1-5:\n\n1 ⭐ - Poor\n2 ⭐⭐ - Fair\n3 ⭐⭐⭐ - Good\n4 ⭐⭐⭐⭐ - Very Good\n5 ⭐⭐⭐⭐⭐ - Excellent',
            timestamp: new Date()
          };
          await addMessageAndSave(ratingMessage);
          setAwaitingRating(true);
        } else {
          // Rating message exists, check if we're still awaiting rating
          // If user hasn't submitted yet, set awaiting rating to true
          if (!awaitingRating) {
            setAwaitingRating(true);
          }
        }
      } else {
        // Rating already submitted, change flow stage
        setFlowStage('documents');
        setAwaitingRating(false);
      }
    }
  };

  const loadHistoryDocuments = async () => {
    if (!currentUser?.id) return;
    
    setHistoryLoading(true);
    try {
      const allDocs = await getDocumentsByUser(currentUser.id);
      setHistoryDocs(allDocs);
      if (allDocs.length > 0) {
        setHasGeneratedDocuments(true);
      }
    } catch (error) {
      console.error('Error loading history documents:', error);
      setHistoryDocs([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleViewHistoryDocument = (doc: GeneratedDocument) => {
    // Convert GeneratedDocument to Document format for viewing
    const viewDoc: Document = {
      id: doc.id,
      type: doc.document_type,
      title: doc.document_title,
      keyPoints: Array.isArray(doc.key_points) ? doc.key_points : typeof doc.key_points === 'string' ? JSON.parse(doc.key_points) : [],
      fullContent: doc.full_content,
      pdfUrl: doc.pdf_url || undefined,
      status: doc.generation_status === 'completed' ? 'completed' : doc.generation_status === 'failed' ? 'failed' : 'generating'
    };
    setSelectedDocument(viewDoc);
    setViewMode('document');
  };

  const handleDownloadHistoryDocument = async (doc: GeneratedDocument) => {
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


  const handleOpenDashboard = async () => {
    if (!hasGeneratedDocuments) return;
    if (!documents.length && currentSessionId) {
      await loadDocumentsFromDatabase();
    }
    setViewMode('dashboard');
  };

  const handleOpenMentors = () => {
    setViewMode('mentors');
  };

  const handleLogout = async () => {
    await auth.signOut();
    if (onNavigate) {
      onNavigate('home');
    }
  };

  const renderMainContent = () => {
    if (viewMode === 'dashboard') {
      return (
        <DocumentDashboard
          documents={documents}
          onViewDocument={handleViewDocument}
          onDownloadPdf={handleDownloadPdf}
          onBackToChat={handleBackToChat}
        />
      );
    }

    if (viewMode === 'history') {
      return (
        <DocumentHistory
          documents={historyDocs}
          loading={historyLoading}
          onView={handleViewHistoryDocument}
          onDownload={(d) => handleDownloadHistoryDocument(d)}
          onBackToChat={handleBackToChat}
        />
      );
    }

    if (viewMode === 'mentors') {
      return (
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-gray-950 via-gray-900 to-black">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col gap-2 mb-8 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-widest text-blue-400">Expert Network</p>
                <h2 className="text-3xl font-bold text-white">Meet Your Mentors</h2>
                <p className="text-gray-400 mt-2">
                  Connect with specialists who have guided hundreds of founders through registration, compliance, branding, and HR.
                </p>
              </div>
              <button
                onClick={handleBackToChat}
                className="self-start rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-colors duration-200 hover:border-blue-500 hover:text-white"
              >
                Back to Chat
              </button>
            </div>

            {mentorsLoading ? (
              <div className="flex h-48 items-center justify-center rounded-2xl border border-gray-800 bg-gray-900/60">
                <div className="flex items-center space-x-3 text-blue-300">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading mentor profiles...</span>
                </div>
              </div>
            ) : mentorsError ? (
              <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 px-6 py-4 text-yellow-100">
                {mentorsError}
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                {mentors.map((mentor) => (
                  <div
                    key={mentor.id}
                    className="rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900/90 via-gray-900/70 to-gray-800/60 p-6 shadow-lg shadow-blue-900/20"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-2xl font-semibold text-white">{mentor.name}</h3>
                        {mentor.location && (
                          <p className="mt-1 text-sm text-blue-300">{mentor.location}</p>
                        )}
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-4 py-2 text-sm text-blue-200 capitalize">
                        <Star className="h-4 w-4 text-amber-400" />
                        <span>{mentor.availability_status}</span>
                      </div>
                    </div>

                    <p className="mt-4 text-gray-300">
                      {Array.isArray(mentor.expertise_areas)
                        ? mentor.expertise_areas.join(' • ')
                        : mentor.expertise_areas || 'Expert guidance across core startup functions.'}
                    </p>

                    <div className="mt-6 flex flex-col gap-3 border-t border-gray-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1 text-sm text-gray-300">
                        <a href={`mailto:${mentor.email}`} className="flex items-center gap-2 text-blue-300 hover:text-blue-200">
                          <Mail className="h-4 w-4" />
                          {mentor.email}
                        </a>
                        {mentor.phone && (
                          <a href={`tel:${mentor.phone}`} className="flex items-center gap-2 text-blue-300 hover:text-blue-200">
                            <Phone className="h-4 w-4" />
                            {mentor.phone}
                          </a>
                        )}
                      </div>
                      <button className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
                        Schedule intro call
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (viewMode === 'document' && selectedDocument) {
      return (
        <DocumentViewer
          document={selectedDocument}
          onBack={handleBackToDashboard}
          onDownloadPdf={() => handleDownloadPdf(selectedDocument)}
        />
      );
    }

    // Chat view
    return (
      <div className="flex flex-col h-full">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-3xl flex ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start space-x-3`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  message.type === 'user' ? 'bg-blue-600' : 'bg-gray-700'
                }`}>
                  {message.type === 'user' ?
                    <User className="h-4 w-4" /> :
                    <Bot className="h-4 w-4" />
                  }
                </div>

                {/* Message Content */}
                <div className={`rounded-lg p-4 ${
                  message.type === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-100'
                }`}>
                  <p className="whitespace-pre-line">{message.content}</p>
                  
                  {/* Show loading animation if this is the processing message and documents are still generating */}
                  {message.type === 'ai' && 
                   message.content.includes('Processing your information and generating your business documents') &&
                   (flowStage === 'generating' || flowStage === 'documents') &&
                   documents.some(doc => doc.status === 'generating') && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <DocumentGenerationLoader documents={documents} />
                    </div>
                  )}

                  {/* Single Mentor Card */}
                  {message.mentorCard && (
                    <div className="mt-3 bg-gray-700 rounded-lg p-3">
                      <h4 className="font-semibold text-white mb-2">Connect with Expert</h4>
                      <div className="space-y-2 text-sm">
                        <p className="font-medium">{message.mentorCard.name}</p>
                        <p className="text-gray-300">{message.mentorCard.expertise}</p>
                        <div className="flex items-center space-x-4">
                          <a href={`mailto:${message.mentorCard.email}`} className="flex items-center space-x-1 text-blue-400 hover:text-blue-300">
                            <Mail className="h-4 w-4" />
                            <span>Email</span>
                          </a>
                          <a href={`tel:${message.mentorCard.phone}`} className="flex items-center space-x-1 text-blue-400 hover:text-blue-300">
                            <Phone className="h-4 w-4" />
                            <span>Call</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Multiple Mentor Cards */}
                  {message.mentorCards && message.mentorCards.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {message.mentorCards.map((mentor, index) => (
                        <div key={index} className="bg-gray-700 rounded-lg p-3">
                          <h4 className="font-semibold text-white mb-2">{mentor.service} Expert</h4>
                          <div className="space-y-2 text-sm">
                            <p className="font-medium">{mentor.name}</p>
                            <p className="text-gray-300">{mentor.expertise}</p>
                            <div className="flex items-center space-x-4">
                              <a href={`mailto:${mentor.email}`} className="flex items-center space-x-1 text-blue-400 hover:text-blue-300">
                                <Mail className="h-4 w-4" />
                                <span>Email</span>
                              </a>
                              {mentor.phone && (
                                <a href={`tel:${mentor.phone}`} className="flex items-center space-x-1 text-blue-400 hover:text-blue-300">
                                  <Phone className="h-4 w-4" />
                                  <span>Call</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Timestamp */}
                  <p className="text-xs opacity-60 mt-2">
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
          
          {/* Show floating loader if documents are generating and we haven't shown the processing message yet */}
          {(flowStage === 'generating' || flowStage === 'documents') && 
           documents.length > 0 && 
           documents.some(doc => doc.status === 'generating') && 
           !messages.some(msg => msg.content.includes('Processing your information and generating your business documents')) && (
            <div className="flex justify-start">
              <div className="max-w-3xl flex flex-row items-start space-x-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-700">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-lg p-4 bg-gray-800 text-gray-100">
                  <p className="mb-4">Processing your information and generating your business documents...</p>
                  <DocumentGenerationLoader documents={documents} />
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-800 p-4">
          {/* Show message while documents are generating */}
          {(flowStage === 'generating' || flowStage === 'documents') && 
           documents.some(doc => doc.status === 'generating') && (
            <div className="mb-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                <p className="text-sm text-blue-300">
                  Please wait while we generate your documents. This may take a few moments...
                </p>
              </div>
            </div>
          )}
          
          <div className="flex items-center space-x-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={(e) => {
                  // Disable input while documents are generating
                  if ((flowStage === 'generating' || flowStage === 'documents') && 
                      documents.some(doc => doc.status === 'generating')) {
                    return;
                  }
                  if (e.key === 'Enter') handleSendMessage();
                }}
                placeholder={
                  (flowStage === 'generating' || flowStage === 'documents') && 
                  documents.some(doc => doc.status === 'generating')
                    ? "Generating documents... Please wait"
                    : "Type your message..."
                }
                disabled={(flowStage === 'generating' || flowStage === 'documents') && 
                         documents.some(doc => doc.status === 'generating')}
                className={`w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  (flowStage === 'generating' || flowStage === 'documents') && 
                  documents.some(doc => doc.status === 'generating')
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={(flowStage === 'generating' || flowStage === 'documents') && 
                       documents.some(doc => doc.status === 'generating')}
              className={`p-2 rounded-lg transition-colors duration-200 ${
                (flowStage === 'generating' || flowStage === 'documents') && 
                documents.some(doc => doc.status === 'generating')
                  ? 'bg-gray-700 cursor-not-allowed opacity-50'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="bg-black/90 backdrop-blur-sm border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <img src="/Logo Gear.png" alt="StartUP Companion Logo" className="h-8 w-8" />
              <span className="text-xl font-bold text-white">StartUP Companion</span>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => { setViewMode('history'); loadHistoryDocuments(); }}
                className="flex items-center space-x-2 rounded-lg px-3 py-2 text-gray-300 transition-colors duration-200 hover:bg-gray-800/80 hover:text-white"
              >
                <History className="h-5 w-5" />
                <span>History</span>
              </button>

              {(flowStage === 'documents' || flowStage === 'rating' || hasGeneratedDocuments) && (
                <button
                  onClick={handleOpenDashboard}
                  className="flex items-center space-x-2 rounded-lg px-3 py-2 text-gray-300 transition-colors duration-200 hover:bg-gray-800/80 hover:text-white"
                >
                  <FileCheck className="h-5 w-5" />
                  <span>Documents</span>
                </button>
              )}

              <button
                onClick={handleOpenMentors}
                className="flex items-center space-x-2 rounded-lg px-3 py-2 text-gray-300 transition-colors duration-200 hover:bg-gray-800/80 hover:text-white"
              >
                <Users className="h-5 w-5" />
                <span>Mentors</span>
              </button>

              <button
                onClick={handleLogout}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {renderMainContent()}
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-black border-t border-gray-800 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center space-x-2">
            <img src="/Logo Gear.png" alt="StartUP Companion Logo" className="h-6 w-6" />
            <span className="text-lg font-bold text-white">StartUP Companion</span>
          </div>
          <p className="text-center text-gray-400 text-sm mt-2">
            Launch your business in personalized way in 30 minutes
          </p>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
