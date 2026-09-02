/**
 * English translation resource — the canonical shape.
 *
 * Every other locale is type-checked against `TranslationResource`, so adding a
 * key here surfaces a compile error in each locale that has not been updated.
 * Note the absence of `as const`: values stay widened to `string` so sibling
 * locales can satisfy the same type with different text.
 *
 * `{placeholder}` tokens are substituted by `t()` at call time.
 */
const en = {
  common: {
    requiredMarker: "*",
    requiredNote: "Fields marked with * are mandatory",
    optional: "optional",
    submit: "Submit",
    cancel: "Cancel",
    back: "Back",
    continue: "Continue",
    loading: "Please wait…",
    retry: "Try again",
    selectPlaceholder: "Select",
    stepOf: "Step {current} of {total}",
  },

  language: {
    label: "Language",
    english: "English",
    hindi: "हिन्दी",
    selectorAria: "Select interface language",
  },

  /**
   * Header navigation. The set shown depends on the session role, so the keys
   * are grouped by audience: anonymous visitors, citizens, departmental staff.
   */
  nav: {
    // anonymous
    register: "Register",
    login: "Login",
    officerLogin: "Officer Login",
    // citizen
    complaint: "Complaint",
    myComplaints: "My Complaints",
    // officer / supervisor / admin
    dashboard: "Dashboard",
    allComplaints: "All Complaints",
    adminPortal: "Admin Portal",
  },

  shell: {
    govOfIndia: "Government of India — Digital Grievance Mission",
    platformName: "SamadhanSetu",
    platformTagline: "Integrated Citizen Grievance Redressal Platform",
  },

  register: {
    metaTitle: "Citizen Registration — SamadhanSetu",
    metaDescription:
      "Register as a citizen on SamadhanSetu to file and track public service grievances.",
    heading: "Registration / Sign Up",
    formHeading: "Registration / Sign Up Form",
    intro:
      "Create a citizen account to file grievances, track their progress and receive updates. Registration requires a working Indian mobile number for verification.",
    stepDetails: "Enter Details",
    stepVerify: "Verify Mobile",
    stepMpin: "Create MPIN",
    sectionApplicant: "Applicant Details",
    sectionAddress: "Address",
    sectionContact: "Contact Details",

    fullName: "Full Name",
    fullNameHint: "As per your government-issued identity document",
    gender: "Gender",
    genderMale: "Male",
    genderFemale: "Female",
    genderTransgender: "Transgender",

    premise: "Premise Number / Name",
    premiseHint: "House or building number and name",
    subLocality: "Sub-locality",
    subLocalityHint: "Street, lane or sector",
    locality: "Locality",
    localityHint: "Area, village or town",
    country: "Country",
    state: "State",
    district: "District",
    districtSelectStateFirst: "Select a State first",
    pincode: "Pincode",
    pincodeHint: "6-digit postal code",

    mobile: "Mobile Number",
    mobileHint: "10-digit Indian mobile number. A verification code will be sent to this number.",
    mobilePrefix: "+91",
    phone: "Phone Number with STD code",
    phoneHint: "Landline, for example 020-25501234",
    email: "Email Address",
    emailHint: "Used only for grievance correspondence",

    privacyNote:
      "Your contact details are used solely to update you on your grievances. They are stored on government servers and are not shared publicly.",
    submitDetails: "Continue to Mobile Verification",
    submitting: "Validating details…",
  },

  otp: {
    heading: "Verify your mobile number",
    intro: "Enter the 6-digit verification code sent to {mobile} to continue.",
    codeLabel: "Verification Code (OTP)",
    codeHint: "6 digits",
    verify: "Verify",
    verifying: "Verifying…",
    resend: "Resend code",
    resending: "Resending…",
    changeMobile: "Edit details",
    attemptsRemaining: "{count} verification attempts remaining",
    resendsRemaining: "{count} resend attempts remaining",
    expiresAt: "This code expires at {time}.",
    verified: "Mobile number verified",

    providerNotConfiguredTitle: "No OTP provider is configured",
    providerNotConfiguredBody:
      "No verification message has been sent. The production provider is not connected yet, so this step cannot deliver a code to your phone.",
    devDeliveryTitle: "Development mode — code not sent to your phone",
    devDeliveryBody:
      "No SMS or WhatsApp message was sent. The verification code has been written to the server console for local testing only.",
  },

  mpin: {
    heading: "Create your MPIN",
    intro:
      "Your MPIN is a 6-digit number you will use together with your mobile number to sign in. Choose a number you can remember but others cannot guess.",
    create: "Create MPIN",
    confirm: "Confirm MPIN",
    createHint: "Exactly 6 digits",
    confirmHint: "Re-enter the same 6 digits",
    show: "Show MPIN",
    hide: "Hide MPIN",
    rulesTitle: "Your MPIN must",
    ruleLength: "be exactly 6 digits",
    ruleNumeric: "contain numbers only",
    ruleNotWeak: "not be repeated or sequential, such as 000000 or 123456",
    register: "Complete Registration",
    registering: "Completing registration…",
  },

  success: {
    heading: "Registration successful",
    body: "Your citizen account has been created on SamadhanSetu.",
    registeredMobile: "Registered mobile number",
    nextStepTitle: "Next step",
    nextStepBody:
      "Sign in with your mobile number and MPIN to file a grievance and track its progress.",
    noMessageNote:
      "No confirmation SMS, WhatsApp message or email has been sent — those services are not connected yet.",
    goToLogin: "Go to Login",
    backHome: "Return to Home",
  },

  login: {
    metaTitle: "Citizen Login — SamadhanSetu",
    metaDescription:
      "Sign in to SamadhanSetu with your registered mobile number and MPIN to file and track grievances.",
    heading: "Citizen Login",
    formHeading: "Sign in to your account",
    intro:
      "Sign in with the mobile number you registered and your 6-digit MPIN to file a grievance and track its progress.",
    mobile: "Mobile Number",
    mobileHint: "The 10-digit mobile number used at registration",
    mpin: "MPIN",
    mpinHint: "Your 6-digit MPIN",
    showMpin: "Show MPIN",
    hideMpin: "Hide MPIN",
    submit: "Login",
    submitting: "Signing in…",
    forgotMpin: "Forgot MPIN?",
    forgotMpinComingSoonTitle: "MPIN reset is not available yet",
    forgotMpinComingSoonBody:
      "Resetting your MPIN will be enabled shortly. Please contact the helpline on 1800-11-4455 for assistance in the meantime.",
    noAccount: "Do not have an account?",
    registerLink: "Register as a citizen",
    securityNote:
      "Never share your MPIN with anyone. Officials will never ask for your MPIN over a call or message.",
    backHome: "Return to Home",
    signedInAs: "Signed in as {name}",
    logout: "Logout",
    loggingOut: "Signing out…",
    welcomeBack: "Welcome back, {name}. You are now signed in.",
  },

  priority: {
    low: "Low",
    medium: "Medium",
    high: "High",
    critical: "Critical",
  },

  /** Keys are the lowercased `GRIEVANCE_STATUSES` values. */
  status: {
    submitted: "Submitted",
    under_review: "Under Review",
    assigned: "Assigned",
    in_progress: "In Progress",
    resolved: "Resolved",
    closed: "Closed",
  },

  complaint: {
    metaTitle: "File a Complaint — SamadhanSetu",
    metaDescription:
      "Submit a public service complaint by voice or by form. The department and priority are determined automatically.",
    heading: "File a Complaint",
    intro:
      "Describe your problem in your own words, by speaking or by typing. SamadhanSetu identifies the correct department and the priority for you — you do not need to know which ministry handles your issue.",
    chooseMethod: "Choose how you would like to file",
    methodVoice: "Complaint by Voice",
    methodVoiceHint: "Speak in Hindi or English. Best if typing is difficult for you.",
    methodForm: "Complaint by Form",
    methodFormHint: "Type your complaint details.",
    selectMethod: "Select",
    changeMethod: "Change method",

    autoRoutingNotice:
      "The department and priority are decided automatically from what you describe. You do not select them.",

    sectionDetails: "Complaint Details",
    sectionLocation: "Location of the Problem",
    title_: "Complaint Title",
    titleHint: "One line summarising the problem",
    description: "Describe the Problem",
    descriptionHint: "Include what happened, when it started and how it affects you",
    descriptionCounter: "{count} characters · minimum 20",
    address: "Address or Landmark",
    addressHint: "Where the problem is occurring",
    state: "State",
    district: "District",
    districtSelectStateFirst: "Select a State first",
    pincode: "Pincode",
    pincodeOptional: "Pincode",
    useMyLocation: "Attach my current location",
    locationAttached: "Location attached",
    locationUnavailable: "Location could not be read from this device",
    locationOptionalNote:
      "Optional. Sharing coordinates helps identify problem hotspots. Nothing is recorded unless you choose this.",
    submit: "Submit Complaint",
    submitting: "Submitting and analysing…",
    submitAnyway: "Submit my complaint anyway",

    sectionEvidence: "Photographs",
    evidenceIntro:
      "Attach up to 3 photographs of the problem. This is optional, but a clear photograph usually helps the department act faster.",
    evidenceAdd: "Add a photograph",
    evidenceLimits: "JPG or PNG · up to 5 MB each · maximum 3 photographs",
    evidencePrivacyNote:
      "Hidden information in your photograph, including the location where it was taken and your device details, is removed before the image is stored. Photographs are visible only to you and to the officers handling your complaint.",
    evidenceUploading: "Uploading…",
    evidenceRemove: "Remove",
    evidenceRemoveLabel: "Remove photograph {name}",
    evidenceAttachedCount: "{count} of {max} photographs attached",
    evidenceListLabel: "Attached photographs",
    evidencePreviewAlt: "Preview of attached photograph {name}",
    evidenceFull: "You have attached the maximum of 3 photographs.",

    duplicateChecking: "Checking for similar complaints…",
    duplicateHeading: "A similar complaint may already exist",
    duplicateIntro:
      "The following complaint(s) from this area appear to describe a similar problem. Please check whether your issue is already reported. If your problem is different, or if it has not been resolved, continue and submit your complaint.",
    duplicateNotBlockedNote:
      "This is only a suggestion. Your right to file a complaint is not affected, and nothing is submitted until you choose to.",
    duplicateComplaintNumber: "Complaint Number",
    duplicateArea: "Area",
    duplicateFiledOn: "Filed on",
    duplicateStatus: "Current status",
    duplicateSimilarity: "Similarity",
    duplicateReason: "Why this was shown",
    duplicateReasonNearby: "Reported about {distance} m away, with closely matching wording.",
    duplicateReasonPincode: "Reported in the same pincode, with closely matching wording.",
    duplicateReasonDistrict: "Reported in the same district, with closely matching wording.",
    duplicatePrivacyNote:
      "Only the complaint number, area, date and status are shown. The other citizen's name, contact details, address and complaint text are not disclosed.",
    duplicateDismiss: "My problem is different",

    resultDuplicateHighTitle: "Possible duplicate recorded for review",
    resultDuplicateHighBody:
      "Your complaint has been registered and kept in full. It closely matches an earlier complaint, so it has been linked to it for an officer to review. Neither complaint has been removed or merged.",
    resultDuplicatePossibleTitle: "Similar complaint noted",
    resultDuplicatePossibleBody:
      "Your complaint has been registered and kept in full. It resembles an earlier complaint from the same area, so both have been flagged for an officer to compare.",
    resultDuplicateUnavailableTitle: "Duplicate check could not be completed",
    resultDuplicateUnavailableBody:
      "Your complaint has been registered normally. The automatic check for similar complaints could not be completed, so it has been left for the grievance cell to review. Nothing has been assumed either way.",
    resultDuplicateRelated: "Linked to complaint",
    resultEvidenceStored: "{count} photograph(s) attached",

    voiceHeading: "Record your complaint",
    voiceIntro:
      "Press record and describe the problem in Hindi or English. You will be able to read the text and correct it before submitting.",
    voiceStart: "Start recording",
    voiceStop: "Stop recording",
    voiceRecording: "Recording…",
    voiceRecorded: "Recording ready",
    voiceReplay: "Play back",
    voiceDiscard: "Record again",
    voiceTranscribe: "Convert speech to text",
    voiceTranscribing: "Converting speech to text…",
    voiceDuration: "Length: {seconds} seconds",
    voicePermissionDenied:
      "Microphone access was refused. Allow microphone access in your browser, or use the form instead.",
    voiceUnsupported: "This browser cannot record audio. Please use the form method instead.",
    transcriptHeading: "Check the text",
    transcriptIntro:
      "This is what was understood from your recording. Correct anything that is wrong — your corrected wording is what will be submitted.",
    transcriptDetectedLanguage: "Detected language: {language}",
    transcriptEdited: "You have edited the text",
    languageEnglish: "English",
    languageHindi: "Hindi",
    languageOther: "Other",

    resultHeading: "Complaint registered",
    resultBody: "Your complaint has been recorded and routed for action.",
    resultGrievanceId: "Complaint Number",
    resultStatus: "Status",
    resultDepartment: "Routed to",
    resultCategory: "Category",
    resultPriority: "Priority",
    resultConfidence: "Confidence",
    resultReasoning: "Why it was routed this way",
    resultSlaDue: "Expected action by",
    resultAutoNote:
      "The department and priority above were determined automatically from your description. An officer may revise them after review.",
    resultPendingReviewTitle: "Awaiting departmental review",
    resultPendingReviewBody:
      "Your complaint has been saved, but automatic routing could not be completed. It will be reviewed and assigned by the grievance cell. No department or priority has been guessed.",
    resultNoNotificationNote:
      "No SMS, WhatsApp message or email has been sent — those services are not connected yet. Please keep your complaint number.",
    fileAnother: "File another complaint",
    backHome: "Return to Home",

    statusSubmitted: "Submitted",
    signInRequiredTitle: "Please sign in to file a complaint",
    signInRequiredBody:
      "Only registered citizens can file a complaint, so that you can track its progress.",
    goToLogin: "Go to Login",
  },

  myComplaints: {
    metaTitle: "My Complaints — SamadhanSetu",
    metaDescription:
      "View every complaint you have filed on SamadhanSetu, with its current status, routed department and expected action date.",
    heading: "My Complaints",
    intro:
      "Every complaint filed from your account, newest first. Only your own complaints are visible here.",
    count: "{count} complaint(s) on record",
    loading: "Loading your complaints…",
    refresh: "Refresh",
    fileNew: "File a complaint",

    emptyTitle: "No complaints yet",
    emptyBody:
      "You have not filed a complaint from this account. When you do, it will appear here with its status and routing.",

    columnId: "Complaint Number",
    columnTitle: "Subject",
    columnFiledAt: "Filed on",
    columnStatus: "Status",
    columnDepartment: "Routed to",
    columnPriority: "Priority",
    columnSlaDue: "Expected action by",
    columnLocation: "Location",

    pendingRouting: "Awaiting departmental review",
    pendingRoutingNote:
      "Automatic routing could not be completed for this complaint. No department or priority has been guessed — the grievance cell will assign it.",
    notAvailable: "—",

    signInRequiredTitle: "Please sign in to view your complaints",
    signInRequiredBody:
      "Your complaint history is tied to your citizen account, so it is only shown after you sign in.",
  },

  errors: {
    title: "Please correct the following",
    genericTitle: "Something went wrong",

    name_invalid: "Enter your full name using letters only (2 to 100 characters).",
    gender_invalid: "Select your gender.",
    premise_required: "Enter your premise number or name.",
    sub_locality_invalid: "Sub-locality must be 100 characters or fewer.",
    locality_required: "Enter your locality, village or town.",
    country_invalid: "Country must be India.",
    state_invalid: "Select a valid State or Union Territory.",
    district_invalid: "Select a valid District.",
    district_state_mismatch: "The selected District does not belong to the selected State.",
    pincode_invalid: "Enter a valid 6-digit pincode.",
    mobile_invalid: "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9.",
    phone_invalid: "Enter a valid landline number with STD code, or leave the field blank.",
    email_invalid: "Enter a valid email address, or leave the field blank.",

    otp_invalid: "The verification code is incorrect.",
    otp_expired: "The verification code has expired. Request a new code.",
    otp_attempts_exceeded:
      "Too many incorrect attempts. Request a new verification code to continue.",
    otp_resend_limit: "Resend limit reached. Start the registration again after some time.",
    otp_rate_limited: "Too many verification requests for this mobile number. Try again later.",
    otp_not_verified: "Verify your mobile number before creating an MPIN.",
    provider_not_configured:
      "The verification service is not configured, so no code could be sent. Contact the helpline for assistance.",

    challenge_not_found: "This registration session is no longer valid. Please start again.",
    challenge_expired: "This registration session has expired. Please start again.",
    verification_required: "Mobile verification is required before completing registration.",

    mpin_invalid: "Your MPIN must be exactly 6 digits.",
    mpin_weak: "This MPIN is too easy to guess. Avoid repeated or sequential digits.",
    mpin_mismatch: "The two MPINs do not match.",

    mobile_already_registered:
      "An account already exists for this mobile number. Please sign in instead.",

    database_unavailable: "The service is temporarily unavailable. Please try again shortly.",
    server_error: "We could not process your request. Please try again.",
    registration_failed: "Registration could not be completed. Please try again.",

    invalid_credentials: "Invalid mobile number or MPIN.",
    account_locked:
      "Too many failed sign-in attempts. For your security this account is temporarily locked. Try again in {minutes} minute(s).",
    unauthorized: "Please sign in to continue.",
    forbidden: "You do not have permission to access this.",
    logout_failed: "We could not sign you out. Please try again.",

    complaint_title_invalid: "Enter a complaint title of 5 to 150 characters.",
    complaint_description_invalid: "Describe the problem in at least 20 characters (up to 5000).",
    complaint_address_invalid: "Enter the address or landmark where the problem is occurring.",
    complaint_invalid: "Please check the complaint details and try again.",
    complaint_submit_failed: "Your complaint could not be submitted. Please try again.",

    speech_provider_not_configured:
      "Speech recognition is not configured, so your recording could not be converted to text. Please use the form method instead.",
    speech_transcription_failed:
      "Your recording could not be converted to text. Please try recording again, or use the form method.",
    speech_no_speech_detected:
      "No speech was detected in the recording. Please record again and speak clearly.",
    audio_too_large: "The recording is too large. Please record a shorter complaint.",
    audio_too_long: "The recording is too long. Please keep it under 4 minutes.",
    audio_unsupported: "This audio format is not supported. Please try recording again.",
    voice_draft_missing:
      "The recording is no longer available. Please record your complaint again.",
    voice_draft_expired:
      "Too much time has passed since the recording. Please record your complaint again.",

    evidence_too_many: "You can attach up to 3 photographs to a complaint.",
    evidence_too_large: "Each photograph must be 5 MB or smaller.",
    evidence_not_an_image: "This file is not a photograph. Attach a JPG or PNG image.",
    evidence_unsupported_format: "Only JPG and PNG photographs can be attached.",
    evidence_corrupt: "This photograph could not be read. It may be damaged. Try another image.",
    evidence_too_small: "This image is too small to be useful. Attach a clearer photograph.",
    evidence_upload_failed: "The photograph could not be uploaded. Please try again.",
    evidence_provider_not_configured:
      "Photograph uploads are not configured on this server, so your image could not be stored. You can still submit the complaint without a photograph.",
    evidence_draft_missing:
      "One of your photographs is no longer available. Please attach it again.",
    evidence_draft_expired:
      "Too much time has passed since the photograph was attached. Please attach it again.",
    evidence_not_found: "This photograph is no longer available.",
  },
} satisfies TranslationShape;

/**
 * Structural constraint: every leaf must be a string. Declared before use via
 * hoisting so `satisfies` above catches accidental nesting mistakes.
 */
type TranslationShape = { [group: string]: { [key: string]: string } };

export type TranslationResource = typeof en;

export default en;
