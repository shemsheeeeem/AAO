/* AAO skills list: the predefined skills VAs can pick in the Skills editor
   (My Profile > Edit profile, and Onboarding).

   HOW TO EDIT (admins):
   - To add a skill, add a line inside its category, e.g.  "Pinterest marketing",
   - To add a category, add it to AAO_SKILL_CATEGORIES (this sets the order in search results)
     and give it a list in AAO_SKILLS_BY_CATEGORY with the same name.
   - Keep each skill name short (40 characters max) and use each name only once.
   - Removing a skill from this list does not remove it from profiles that already have it.
   - Keep the commas and quotation marks as they are. Save the file, then refresh the site.
   VAs can also add their own custom skills; those are saved under the category "Other". */

window.AAO_SKILL_CATEGORIES = [
  "Admin",
  "Customer support",
  "Digital marketing",
  "Social media",
  "Sales",
  "Writing & content",
  "Design",
  "Web & technical",
  "Video",
  "AI-assisted services",
  "Finance & bookkeeping",
  "Legal support"
];

window.AAO_SKILLS_BY_CATEGORY = {
  "Admin": [
    "Calendar management", "Inbox management", "Email management", "Travel planning", "Data entry",
    "Scheduling", "Notion", "Asana", "Trello", "Google Workspace", "Microsoft Office", "Google Sheets",
    "Excel", "File organization", "Research", "Expense reports", "Slack", "Project coordination",
    "Order processing", "Inventory management", "Supplier follow-up", "Meeting notes"
  ],
  "Customer support": [
    "Email support", "Live chat", "Phone support", "Zendesk", "Gorgias", "Freshdesk", "Help Scout",
    "Intercom", "Help center articles", "Escalation handling", "Returns and refunds", "Order tracking",
    "Customer onboarding", "Ticket triage", "Community management"
  ],
  "Digital marketing": [
    "Lead generation", "Email marketing", "Klaviyo", "Mailchimp", "SEO", "Facebook Ads", "Meta Ads",
    "Google Ads", "Paid ads", "GoHighLevel", "Marketing automation", "Funnel building", "Landing pages",
    "Google Analytics", "A/B testing", "Market research", "Campaign reporting", "Affiliate marketing"
  ],
  "Social media": [
    "Social media management", "Instagram", "Facebook", "TikTok", "LinkedIn", "YouTube", "Pinterest",
    "Content calendars", "Caption writing", "Community engagement", "Canva", "Meta Business Suite",
    "Influencer outreach", "Short-form video strategy"
  ],
  "Sales": [
    "Appointment setting", "Cold calling", "Cold email outreach", "LinkedIn outreach", "CRM management",
    "HubSpot", "Salesforce", "Pipedrive", "Lead qualification", "Sales follow-up", "Proposal writing",
    "Pipeline reporting", "Prospect research", "Data cleanup"
  ],
  "Writing & content": [
    "Copywriting", "Blog writing", "Product copy", "Product descriptions", "Newsletters",
    "Email sequences", "Case studies", "Ghostwriting", "Editing and proofreading", "Technical writing",
    "Script writing", "Content strategy", "SEO writing", "Press releases"
  ],
  "Design": [
    "Graphic design", "Canva design", "Figma", "Adobe Photoshop", "Adobe Illustrator", "Brand identity",
    "Logo design", "Social media graphics", "Presentation design", "Pitch decks", "UX", "UI design",
    "Web design", "Design systems", "Illustration"
  ],
  "Web & technical": [
    "WordPress", "Shopify", "Wix", "Squarespace", "Webflow", "Elementor", "HTML and CSS", "JavaScript",
    "React", "TypeScript", "Node.js", "Website maintenance", "Zapier", "Make.com", "Airtable",
    "Tech support", "API integrations"
  ],
  "Video": [
    "Video editing", "Premiere Pro", "CapCut", "Final Cut Pro", "DaVinci Resolve", "Reels and Shorts",
    "YouTube editing", "Subtitles and captions", "Thumbnails", "Motion graphics", "Podcast editing",
    "Descript", "Audio cleanup"
  ],
  "AI-assisted services": [
    "ChatGPT workflows", "Prompt writing", "AI content creation", "AI image generation",
    "AI research summaries", "Chatbot setup", "Automation", "Notion AI", "AI meeting notes",
    "Custom GPTs", "AI voice and video tools"
  ],
  "Finance & bookkeeping": [
    "Bookkeeping", "QuickBooks", "Xero", "Invoicing", "Accounts payable", "Accounts receivable",
    "Bank reconciliation", "Payroll support", "Expense tracking", "Financial reporting", "Month-end close",
    "Collections follow-up"
  ],
  "Legal support": [
    "Document prep", "Contract admin", "Legal research", "Client intake", "Case management",
    "Legal transcription", "E-filing", "NDAs", "DocuSign", "Deadline tracking", "Matter files"
  ]
};
