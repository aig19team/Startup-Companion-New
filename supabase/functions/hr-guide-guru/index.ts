import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateAndStorePDF } from '../_shared/pdfGenerator.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestPayload {
  message: string;
  sessionId: string;
  userId: string;
  businessProfile?: any;
}

const HR_GUIDE_PROMPT = `You are an expert HR consultant specializing in startup and SME human resources management in India. Generate a comprehensive HR setup guide based on the business profile provided.

IMPORTANT: Analyze the business description, industry, and team size to provide:
- Industry-appropriate organizational structures and roles
- Compensation benchmarks specific to the industry and location
- HR policies tailored to the business type and culture
- Hiring roadmaps aligned with business growth stage

The guide MUST include:

1. **Organizational Structure**
   - Recommended org chart for the business size
   - Key roles and responsibilities
   - Reporting structure
   - Hiring roadmap (Phase 1, 2, 3)

2. **Employment Documentation**
   - Offer letter template structure
   - Employment agreement key clauses
   - Appointment letter format
   - Probation period guidelines
   - Notice period recommendations
   - Non-disclosure agreement (NDA)
   - Non-compete clauses

3. **HR Policies**
   - Leave policy (casual, sick, earned leave)
   - Work hours and attendance policy
   - Remote work policy
   - Code of conduct
   - Anti-harassment policy
   - Grievance redressal mechanism
   - Performance review process
   - Disciplinary action policy

4. **Compensation and Benefits**
   - Salary structure components (basic, HRA, special allowance)
   - Salary benchmarking guidelines
   - Variable pay and bonus structure
   - Reimbursement policies (travel, medical, internet)
   - Insurance benefits (health, accidental)
   - Retirement benefits (PF, gratuity)

5. **Payroll Management**
   - Payroll processing timeline
   - Statutory deductions (PF, PT, TDS)
   - Payslip format
   - Form 16 and tax declaration
   - Reimbursement processing
   - Payroll software recommendations

6. **Onboarding Process**
   - Pre-joining checklist
   - Day 1 onboarding agenda
   - First week orientation plan
   - 30-60-90 day goals
   - Buddy/mentor assignment
   - Training and development plan

7. **Performance Management**
   - Goal setting framework (OKRs/KPIs)
   - Performance review cycle
   - Feedback mechanisms
   - Promotion criteria
   - Performance improvement plans

8. **Employee Engagement**
   - Team building activities
   - Recognition and rewards program
   - Communication channels
   - Employee satisfaction surveys
   - Exit interview process

9. **Legal Compliance**
   - Minimum wages act
   - Payment of wages act
   - Gratuity act (after 5 years)
   - Maternity benefit act
   - Sexual harassment prevention (POSH Act)
   - Contract labor regulations

10. **HR Technology Stack**
    - HRMS software recommendations
    - Attendance and leave management tools
    - Payroll software options
    - Recruitment platforms
    - Employee engagement tools

11. **Cost Planning**
    - Per-employee cost breakdown
    - HR software costs
    - Recruitment costs
    - Training and development budget
    - Total HR budget estimation

Format the response in clean markdown with proper headers, templates, checklists, and actionable guidelines. Make it practical and ready-to-implement.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { message, sessionId, userId, businessProfile }: RequestPayload = await req.json();

    let profile = businessProfile;
    if (!profile) {
      const { data: profileData } = await supabaseClient
        .from('business_profiles')
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle();
      profile = profileData || {};
    }

    const contextInfo = `
Business Information:
- Company Name: ${profile.business_name || 'Company'}
- Description: ${profile.company_description || profile.business_description || 'Not provided'}
- Industry: ${profile.industry || profile.business_type || 'General'}
- Business Type: ${profile.business_type || 'General'}
- Location: ${profile.location || 'India'}
- Team Size: ${JSON.stringify(profile.partners_info || profile.directors_partners || [])}
- Number of Owners: ${Array.isArray(profile.partners_info) ? profile.partners_info.length : (Array.isArray(profile.directors_partners) ? profile.directors_partners.length : 1)}
- Color Preference: ${profile.color_preference || 'Not specified'}
- Style Preference: ${profile.style_preference || 'Not specified'}

Generate a comprehensive HR setup guide for this business covering policies, documentation, and compliance.`;

    const fullContent = await callOpenRouterAPI(contextInfo);
    const keyPoints = extractKeyPoints(fullContent);

    console.log('Content generated successfully, starting PDF generation...');
    console.log('HR Guide - Content length:', fullContent.length);
    console.log('HR Guide - User ID:', userId);
    console.log('HR Guide - Business Name:', profile.business_name || 'Your Business');
    
    let pdfResult: { pdfUrl: string; fileName: string } | null = null;
    let pdfError: any = null;

    try {
      console.log('HR Guide - Calling generateAndStorePDF with documentType: hr');
      pdfResult = await generateAndStorePDF(
        {
          userId,
          documentType: 'hr',
          content: fullContent,
          businessName: profile.business_name || 'Your Business'
        },
        supabaseClient
      );
      if (pdfResult) {
        console.log('HR Guide - PDF generated and stored successfully');
        console.log('HR Guide - PDF URL:', pdfResult.pdfUrl);
        console.log('HR Guide - PDF File Name:', pdfResult.fileName);
      } else {
        console.error('HR Guide - PDF generation returned null!');
        console.error('HR Guide - This means the PDF was not uploaded to storage');
        console.error('HR Guide - Check the logs above for upload errors');
      }
    } catch (pdfGenError) {
      console.error('HR Guide - PDF generation threw error:', pdfGenError);
      console.error('HR Guide - Error stack:', pdfGenError instanceof Error ? pdfGenError.stack : 'No stack trace');
      console.error('HR Guide - Error details:', JSON.stringify(pdfGenError, null, 2));
      pdfError = pdfGenError;
    }

    const { data: existingDoc } = await supabaseClient
      .from('generated_documents')
      .select('id')
      .eq('session_id', sessionId)
      .eq('document_type', 'hr')
      .maybeSingle();

    let docData, docError;

    if (existingDoc) {
      const result = await supabaseClient
        .from('generated_documents')
        .update({
          document_title: 'HR Setup Guide',
          key_points: JSON.stringify(keyPoints),
          full_content: fullContent,
          pdf_url: pdfResult?.pdfUrl || null,
          pdf_file_name: pdfResult?.fileName || null,
          generation_status: 'completed',
          service_type: 'confirmed_idea_flow'
        })
        .eq('id', existingDoc.id)
        .select()
        .single();
      docData = result.data;
      docError = result.error;
    } else {
      const result = await supabaseClient
        .from('generated_documents')
        .insert({
          user_id: userId,
          session_id: sessionId,
          document_type: 'hr',
          document_title: 'HR Setup Guide',
          key_points: JSON.stringify(keyPoints),
          full_content: fullContent,
          pdf_url: pdfResult?.pdfUrl || null,
          pdf_file_name: pdfResult?.fileName || null,
          generation_status: 'completed',
          service_type: 'confirmed_idea_flow'
        })
        .select()
        .single();
      docData = result.data;
      docError = result.error;
    }

    if (docError) {
      console.error('Error storing document in database:', docError);
      throw new Error(`Database error: ${docError.message}`);
    }

    return new Response(
      JSON.stringify({
        response: fullContent,
        keyPoints: keyPoints,
        fullContent: fullContent,
        pdfUrl: pdfResult?.pdfUrl,
        documentId: docData?.id,
        pdfGenerationStatus: pdfResult ? 'success' : 'failed',
        warning: !pdfResult ? 'Document saved successfully but PDF generation failed. You can view the content online.' : null
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in hr-guide-guru function:', error);

    let errorMessage = 'Internal server error';
    let userMessage = 'Failed to generate HR guide. Please try again.';

    if (error.message === 'API_KEY_NOT_CONFIGURED') {
      errorMessage = 'OpenRouter API key not configured';
      userMessage = 'Configuration error: API key missing. Please contact support.';
    } else if (error.message?.startsWith('API_ERROR')) {
      errorMessage = error.message;
      userMessage = 'AI service temporarily unavailable. Please try again in a moment.';
    }

    return new Response(
      JSON.stringify({
        error: errorMessage,
        userMessage: userMessage,
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function callOpenRouterAPI(contextInfo: string): Promise<string> {
  const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');

  if (!openRouterApiKey) {
    console.error('OPENROUTER_API_KEY not configured in edge function environment');
    throw new Error('API_KEY_NOT_CONFIGURED');
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://startup-companion.app',
        'X-Title': 'StartUP Companion'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: HR_GUIDE_PROMPT
          },
          {
            role: 'user',
            content: contextInfo
          }
        ],
        temperature: 0.7,
        max_tokens: 3500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenRouter API error ${response.status}:`, errorText);
      throw new Error(`API_ERROR: ${response.status}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      console.error('Invalid response structure from OpenRouter API:', data);
      throw new Error('INVALID_API_RESPONSE');
    }

    return data.choices[0].message.content;

  } catch (error) {
    console.error('Error calling OpenRouter API:', error);
    throw error;
  }
}

function extractKeyPoints(content: string): string[] {
  const keyPoints: string[] = [];

  if (!content || content.length < 100) {
    return [
      'Employment documentation templates',
      'HR policies (leave, attendance, conduct)',
      'Salary structure guidelines',
      'Payroll and statutory compliance',
      'Onboarding and performance management',
      'HR technology recommendations'
    ];
  }

  // Check for employment documentation
  const docKeywords = ['offer letter', 'appointment letter', 'employment agreement', 'nda', 'documentation'];
  if (docKeywords.some(keyword => content.toLowerCase().includes(keyword))) {
    keyPoints.push('Complete employment documentation templates');
  }

  // Check for HR policies
  const policyKeywords = ['leave policy', 'attendance', 'code of conduct', 'hr polic', 'work hours'];
  if (policyKeywords.some(keyword => content.toLowerCase().includes(keyword))) {
    keyPoints.push('Essential HR policies (leave, attendance, conduct)');
  }

  // Check for compensation
  const compensationKeywords = ['salary', 'compensation', 'pay structure', 'wages', 'benefits'];
  if (compensationKeywords.some(keyword => content.toLowerCase().includes(keyword))) {
    keyPoints.push('Salary structure and compensation guidelines');
  }

  // Check for payroll
  const payrollKeywords = ['payroll', 'pf', 'provident fund', 'tds', 'payslip', 'statutory'];
  if (payrollKeywords.some(keyword => content.toLowerCase().includes(keyword))) {
    keyPoints.push('Payroll processing and statutory compliance');
  }

  // Check for onboarding
  if (content.toLowerCase().includes('onboarding') || content.toLowerCase().includes('orientation') ||
      content.toLowerCase().includes('joining process')) {
    keyPoints.push('Structured onboarding process');
  }

  // Check for performance management
  const performanceKeywords = ['performance', 'appraisal', 'review', 'kpi', 'okr', 'goal setting'];
  if (performanceKeywords.some(keyword => content.toLowerCase().includes(keyword))) {
    keyPoints.push('Performance management framework');
  }

  // Check for organizational structure
  if (content.toLowerCase().includes('org') && (content.toLowerCase().includes('chart') ||
      content.toLowerCase().includes('structure') || content.toLowerCase().includes('hierarchy'))) {
    keyPoints.push('Organizational structure recommendations');
  }

  // Check for HR technology
  if (content.toLowerCase().includes('hrms') || content.toLowerCase().includes('software') ||
      content.toLowerCase().includes('tool') || content.toLowerCase().includes('technology')) {
    keyPoints.push('HR technology and tools recommendations');
  }

  // Check for compliance
  const complianceKeywords = ['minimum wages', 'gratuity', 'maternity', 'posh', 'compliance', 'labor law'];
  if (complianceKeywords.some(keyword => content.toLowerCase().includes(keyword))) {
    keyPoints.push('Legal compliance requirements');
  }

  // Check for employee engagement
  if (content.toLowerCase().includes('engagement') || content.toLowerCase().includes('team building') ||
      content.toLowerCase().includes('recognition')) {
    keyPoints.push('Employee engagement strategies');
  }

  // Add fallback points if needed
  const fallbackPoints = [
    'Employment contract templates',
    'Core HR policy framework',
    'Compensation and benefits structure',
    'Statutory compliance guide',
    'Employee lifecycle management',
    'HR systems and processes'
  ];

  for (const fallback of fallbackPoints) {
    if (keyPoints.length >= 6) break;
    if (!keyPoints.some(point => point.toLowerCase().includes(fallback.toLowerCase().split(' ')[0]))) {
      keyPoints.push(fallback);
    }
  }

  return keyPoints.slice(0, 6);
}