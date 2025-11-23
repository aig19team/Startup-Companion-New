# PowerShell script to deploy Supabase Edge Functions
# This script assumes you have Supabase CLI installed and are logged in

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Deploying Supabase Edge Functions" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Supabase CLI is installed
$supabaseInstalled = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabaseInstalled) {
    Write-Host "ERROR: Supabase CLI is not installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install it using:" -ForegroundColor Yellow
    Write-Host "  npm install -g supabase" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or use the Supabase Dashboard to deploy manually." -ForegroundColor Yellow
    Write-Host "See DEPLOYMENT_GUIDE.md for details." -ForegroundColor Yellow
    exit 1
}

Write-Host "Supabase CLI found. Checking login status..." -ForegroundColor Green
Write-Host ""

# Try to check if logged in (this will fail if not logged in)
$loginCheck = supabase projects list 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: You may not be logged in to Supabase CLI." -ForegroundColor Yellow
    Write-Host "Please run: supabase login" -ForegroundColor Yellow
    Write-Host ""
}

# Get project ref (you may need to set this manually)
$projectRef = Read-Host "Enter your Supabase project reference (or press Enter to skip and deploy manually)"

if ([string]::IsNullOrWhiteSpace($projectRef)) {
    Write-Host ""
    Write-Host "Skipping automated deployment." -ForegroundColor Yellow
    Write-Host "Please deploy manually using one of these methods:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Supabase Dashboard:" -ForegroundColor Cyan
    Write-Host "   - Go to Edge Functions in your Supabase dashboard" -ForegroundColor White
    Write-Host "   - Deploy each function: registration-guide-guru, compliance-guide-guru, hr-guide-guru, branding-guide-guru" -ForegroundColor White
    Write-Host ""
    Write-Host "2. Supabase CLI (if logged in):" -ForegroundColor Cyan
    Write-Host "   supabase functions deploy registration-guide-guru --project-ref YOUR_PROJECT_REF" -ForegroundColor White
    Write-Host "   supabase functions deploy compliance-guide-guru --project-ref YOUR_PROJECT_REF" -ForegroundColor White
    Write-Host "   supabase functions deploy hr-guide-guru --project-ref YOUR_PROJECT_REF" -ForegroundColor White
    Write-Host "   supabase functions deploy branding-guide-guru --project-ref YOUR_PROJECT_REF" -ForegroundColor White
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host "Deploying functions to project: $projectRef" -ForegroundColor Green
Write-Host ""

$functions = @(
    "registration-guide-guru",
    "compliance-guide-guru",
    "hr-guide-guru",
    "branding-guide-guru"
)

foreach ($function in $functions) {
    Write-Host "Deploying $function..." -ForegroundColor Yellow
    supabase functions deploy $function --project-ref $projectRef
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ $function deployed successfully!" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to deploy $function" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Verify all functions are active in Supabase Dashboard" -ForegroundColor White
Write-Host "2. Test HR guide generation to verify PDF storage" -ForegroundColor White
Write-Host "3. Check edge function logs for any errors" -ForegroundColor White
Write-Host ""


