import type { Persona } from '@/lib/schemas';

/**
 * Ten operator personas — each a variant of this platform configured for a
 * different kind of founder, aligned to the creator-founder skeleton (pillars →
 * agents, connectors, metrics, G-Brain). Generated as templates; swap for live
 * configs when a persona gets provisioned.
 */
export const PERSONAS: Persona[] = [
  {
    "id": "persona-marketing-agency",
    "order": 1,
    "name": "Agency Owner",
    "archetype": "Agency Operator",
    "tagline": "Runs 14 client retainers on a 4-person team without dropping a ball",
    "summary": "A marketing/creative agency owner who lives in client delivery, new-business pipeline, and reporting. This OS variant turns a small team's chaos into a watched factory line: every retainer's scope, deadlines, deliverables, and monthly report run on rails so nothing slips and no client churns silently.",
    "accent": "#3df08c",
    "northStar": "Net retainer MRR retained (revenue kept, not just won)",
    "pillars": [
      {
        "name": "New Business",
        "focus": "Lead-to-signed-retainer pipeline and proposals",
        "agents": [
          "Pipeline Bot",
          "Proposal Drafter",
          "Discovery Scheduler",
          "Win-Loss Logger"
        ]
      },
      {
        "name": "Client Delivery",
        "focus": "Retainer scope, deadlines, and deliverables across every account",
        "agents": [
          "Account Pilot",
          "Deadline Sentinel",
          "Scope Guard",
          "QA Reviewer"
        ]
      },
      {
        "name": "Creative Studio",
        "focus": "Asset production, brand consistency, and approvals",
        "agents": [
          "Brief Builder",
          "Asset Wrangler",
          "Brand Cop",
          "Approval Chaser"
        ]
      },
      {
        "name": "Reporting & Retention",
        "focus": "Monthly client reports, health scores, and churn defense",
        "agents": [
          "Report Compiler",
          "Health Scorer",
          "Churn Sentinel",
          "QBR Prep"
        ]
      },
      {
        "name": "Agency Ops",
        "focus": "Team utilization, billing, and margin per account",
        "agents": [
          "Capacity Planner",
          "Invoice Runner",
          "Margin Watch",
          "Time Auditor"
        ]
      }
    ],
    "connectors": [
      "HubSpot CRM",
      "Asana",
      "Slack",
      "Google Analytics 4",
      "Meta Ads Manager",
      "Google Ads",
      "Harvest",
      "QuickBooks Online"
    ],
    "metrics": [
      "Net retainer MRR",
      "Client health score",
      "On-time delivery rate",
      "Team utilization %",
      "Gross margin per account"
    ],
    "brainUse": "Every agent reads the shared G-Brain for each client's brand guidelines, scope-of-work, past approvals, and account history, so proposals, creative, and reports all speak in the right voice without re-briefing.",
    "signaturePlay": "On the 1st of each month, Report Compiler pulls GA4, Meta, and Google Ads numbers for all active retainers, drafts a branded report per client in their voice, and Health Scorer flags any account trending toward churn so the owner walks into every QBR already knowing who's at risk and who to upsell."
  },
  {
    "id": "persona-brick-and-mortar",
    "order": 2,
    "name": "Multi-Location Operator",
    "archetype": "Brick-and-Mortar Founder",
    "tagline": "6 locations, one floor view — labor, inventory, reviews, traffic.",
    "summary": "A multi-unit restaurant + retail founder running six rooftops from one console. The OS turns POS, labor, inventory, and local-reputation feeds into a single floor view so every store runs to target whether or not the owner is on-site.",
    "accent": "#5ec9f8",
    "northStar": "Same-store sales per labor hour, blended across all locations",
    "pillars": [
      {
        "name": "Floor Ops",
        "focus": "Staffing, shifts, and labor cost per location",
        "agents": [
          "Dispatch Bot",
          "Shift Filler",
          "Labor Cop"
        ]
      },
      {
        "name": "Inventory & Cost",
        "focus": "Stock, COGS, vendor invoices, waste",
        "agents": [
          "Count Keeper",
          "Invoice Reconciler",
          "Waste Watcher",
          "Reorder Bot"
        ]
      },
      {
        "name": "Local Reputation",
        "focus": "Reviews, local search, and listings across units",
        "agents": [
          "Review Harvester",
          "Reply Bot",
          "Listing Sentry"
        ]
      },
      {
        "name": "Foot Traffic & Sales",
        "focus": "Door count, throughput, daypart sales, loyalty",
        "agents": [
          "Traffic Counter",
          "Daypart Analyst",
          "Loyalty Driver"
        ]
      },
      {
        "name": "Back Office",
        "focus": "Payments, payroll, cash, multi-entity P&L",
        "agents": [
          "Settlement Bot",
          "Payroll Runner",
          "P&L Closer"
        ]
      }
    ],
    "connectors": [
      "Toast POS",
      "7shifts",
      "Square",
      "MarginEdge",
      "Google Business Profile",
      "Gusto",
      "QuickBooks Online",
      "G-Brain"
    ],
    "metrics": [
      "Same-store sales (YoY)",
      "Labor cost % of sales",
      "Food cost % (COGS)",
      "Avg Google rating + review velocity",
      "Door count vs conversion to ticket"
    ],
    "brainUse": "Every agent reads the shared G-Brain — par levels, vendor terms, recipe costs, opening checklists, and per-store playbooks — so a fix at one location becomes the standard at all six.",
    "signaturePlay": "Before open, the OS pulls last night's Toast sales and today's 7shifts roster, forecasts each store's covers by daypart, flags any location running over labor target, auto-pings Shift Filler to cover call-outs, and drops a one-line per-store readiness brief — staffed, stocked, and reviews replied — on the owner's phone by 7am."
  },
  {
    "id": "persona-ecommerce-dtc",
    "order": 3,
    "name": "DTC Brand Operator",
    "archetype": "DTC Operator",
    "tagline": "One operator running a Shopify brand on margin, not vibes.",
    "summary": "A solo ecommerce/DTC brand owner running a Shopify storefront, paid acquisition, 3PL fulfillment, and email/SMS retention from one deck. This OS variant watches contribution margin per order in real time and lets agents kill losing ad sets, chase abandoned carts, and flag stockouts before they cost a launch.",
    "accent": "#e1306c",
    "northStar": "Contribution margin after ad spend (per order, blended)",
    "pillars": [
      {
        "name": "Acquisition",
        "focus": "Paid ads + traffic — spend that buys profitable orders",
        "agents": [
          "Spend Sentinel",
          "Creative Tester",
          "Attribution Bot"
        ]
      },
      {
        "name": "Storefront & CRO",
        "focus": "Shopify catalog, PDP, checkout, conversion rate",
        "agents": [
          "Catalog Bot",
          "CRO Tester",
          "Cart Recovery Bot"
        ]
      },
      {
        "name": "Retention",
        "focus": "Email/SMS flows, LTV, repeat-purchase engine",
        "agents": [
          "Flow Builder",
          "Winback Bot",
          "Review Harvester"
        ]
      },
      {
        "name": "Fulfillment & Ops",
        "focus": "Inventory, 3PL, shipping SLAs, stockout defense",
        "agents": [
          "Stockout Sentinel",
          "Dispatch Bot",
          "Returns Triage"
        ]
      },
      {
        "name": "Margin & Finance",
        "focus": "Unit economics, COGS, blended CAC, cash",
        "agents": [
          "Margin Watch",
          "CAC Auditor",
          "Reconcile Bot"
        ]
      }
    ],
    "connectors": [
      "Shopify",
      "Meta Ads Manager",
      "Google Ads",
      "TikTok Ads",
      "Klaviyo",
      "Postscript",
      "ShipBob (3PL)",
      "Stripe"
    ],
    "metrics": [
      "Contribution margin / order",
      "Blended ROAS",
      "CAC vs 60-day LTV",
      "Repeat-purchase rate",
      "Days of inventory on hand"
    ],
    "brainUse": "Every agent reads from one shared G-Brain holding SKU economics, brand voice, hero-creative learnings, and customer segments — so a winning ad angle instantly informs Klaviyo flows and PDP copy.",
    "signaturePlay": "Spend Sentinel cross-checks each ad set's spend against real contribution margin from Shopify+COGS overnight, auto-pauses anything underwater, reallocates budget to the profitable hero creative, and fires a Klaviyo/Postscript winback to yesterday's abandoned carts — so the operator wakes up to a brand that already cut its losers and chased its money."
  },
  {
    "id": "persona-online-coach",
    "order": 4,
    "name": "Personal Online Coach",
    "archetype": "Transformation Coach",
    "tagline": "Clients win, stay, and refer — the practice runs itself.",
    "summary": "A 1:1 and group transformation coach (fitness/health/mindset) running a hybrid book of premium private clients plus cohort programs. This OS variant turns coaching into an operating system: every lead nurtured, every client onboarded, every check-in answered, every at-risk client caught, and every win turned into a referral or testimonial.",
    "accent": "#ffc53d",
    "northStar": "Active retained clients × 90-day transformation rate",
    "pillars": [
      {
        "name": "Acquisition",
        "focus": "Turn leads and discovery calls into signed clients",
        "agents": [
          "Lead Catcher",
          "Booking Bot",
          "Close Tracker"
        ]
      },
      {
        "name": "Onboarding & Delivery",
        "focus": "Intake, program build, and getting clients moving day one",
        "agents": [
          "Intake Bot",
          "Program Builder",
          "Loom Recap Bot"
        ]
      },
      {
        "name": "Accountability & Results",
        "focus": "Check-ins, habit streaks, and tracking transformation data",
        "agents": [
          "Check-in Bot",
          "Streak Sentinel",
          "Results Logger"
        ]
      },
      {
        "name": "Retention & Renewals",
        "focus": "Catch churn risk, drive renewals, harvest wins",
        "agents": [
          "Churn Sentinel",
          "Renewal Closer",
          "Win Harvester"
        ]
      },
      {
        "name": "Brand & Lead-Gen",
        "focus": "Content, community, and referral engine that fills the pipeline",
        "agents": [
          "Content Bot",
          "Community Bot",
          "Referral Bot"
        ]
      }
    ],
    "connectors": [
      "Trainerize",
      "Calendly",
      "Stripe",
      "Kajabi",
      "Typeform",
      "WhatsApp",
      "Loom",
      "Circle"
    ],
    "metrics": [
      "Active retained clients",
      "90-day transformation rate",
      "Check-in response rate",
      "Renewal rate",
      "Referral / testimonial count"
    ],
    "brainUse": "Every agent reads one shared client brain — goals, injuries, macros, milestones, and last-conversation context — so check-ins, recaps, and renewals all sound like the coach who actually knows them.",
    "signaturePlay": "Every client check-in is auto-pulled, scored against their goals, and either gets a personalized voice/text reply drafted or fires a churn flag — so nobody goes silent, no win goes uncaptured, and every transformation becomes a testimonial and a referral ask."
  },
  {
    "id": "persona-saas-founder",
    "order": 5,
    "name": "SaaS Founder OS",
    "archetype": "SaaS Founder",
    "tagline": "Solo indie SaaS founder running product, growth, and MRR on autopilot",
    "summary": "A bootstrapped indie software founder running a self-serve SaaS solo. This OS variant turns the whole funnel — signup to expansion to churn-save — into a closed loop of named agents so one person operates like a Series A growth team.",
    "accent": "#a855f7",
    "northStar": "Net MRR growth (new + expansion − churn)",
    "pillars": [
      {
        "name": "Acquisition",
        "focus": "Top-of-funnel growth loops, SEO, and trial signups",
        "agents": [
          "Loop Engine",
          "SEO Crawler",
          "Trial Capture"
        ]
      },
      {
        "name": "Activation",
        "focus": "Onboarding new signups to first value (aha moment)",
        "agents": [
          "Onboarding Bot",
          "Aha Tracker",
          "Setup Nudger"
        ]
      },
      {
        "name": "Retention",
        "focus": "Churn prediction and win-back before cancellation",
        "agents": [
          "Churn Sentinel",
          "Win-Back Agent",
          "Expansion Hunter"
        ]
      },
      {
        "name": "Support",
        "focus": "Inbox triage, ticket deflection, and docs from real tickets",
        "agents": [
          "Ticket Triage",
          "Deflection Bot",
          "Docs Synth"
        ]
      },
      {
        "name": "Revenue Ops",
        "focus": "MRR, dunning, and every billing event in one view",
        "agents": [
          "MRR Pulse",
          "Dunning Agent",
          "Churn Accountant"
        ]
      }
    ],
    "connectors": [
      "Stripe Billing",
      "Intercom",
      "PostHog",
      "Customer.io",
      "Linear",
      "Ahrefs",
      "Slack",
      "G-Brain"
    ],
    "metrics": [
      "Net MRR",
      "Trial-to-paid conversion %",
      "Net revenue retention",
      "Logo + revenue churn %",
      "Activation rate (time-to-aha)"
    ],
    "brainUse": "Every agent reads and writes the same G-Brain core — feature decisions, churn reasons, support answers, and onboarding playbooks — so a support reply, a docs page, and a win-back email all speak with one product memory.",
    "signaturePlay": "Churn Sentinel watches PostHog usage decay + Stripe billing signals, scores at-risk accounts nightly, then fires Win-Back Agent to send a personalized Customer.io save offer and opens a Linear issue on the feature gap that caused the churn — a full detect-save-fix loop with no founder in the seat."
  },
  {
    "id": "persona-real-estate",
    "order": 6,
    "name": "Real Estate Team Lead",
    "archetype": "Broker-Operator",
    "tagline": "Runs a producing team: leads in, listings up, deals closed.",
    "summary": "A team lead / managing broker running a high-volume residential team. This OS variant turns a leaky lead-to-close pipeline into a machine: leads get worked in 60 seconds, listings get launched and syndicated, showings stay booked, and every transaction crosses the finish line with nothing falling through.",
    "accent": "#22c55e",
    "northStar": "Net closed GCI per quarter (commission off closed-and-funded deals)",
    "pillars": [
      {
        "name": "Lead Gen & Conversion",
        "focus": "Inbound buyer/seller leads to booked appointments",
        "agents": [
          "Speed-to-Lead Bot",
          "Drip Nurturer",
          "ISA Caller"
        ]
      },
      {
        "name": "Listings & Marketing",
        "focus": "List, price, launch, and syndicate every property",
        "agents": [
          "Listing Launcher",
          "CMA Pricer",
          "Syndication Bot",
          "Open House Bot"
        ]
      },
      {
        "name": "Showings & Transactions",
        "focus": "Showings booked and deals driven to close",
        "agents": [
          "Showing Scheduler",
          "Deal Driver",
          "Compliance Hawk"
        ]
      },
      {
        "name": "Team & Accountability",
        "focus": "Agent production, splits, and pipeline coverage",
        "agents": [
          "Roster Tracker",
          "Lead Router",
          "Split Calculator"
        ]
      },
      {
        "name": "Client Care & Database",
        "focus": "Past clients, reviews, and repeat/referral business",
        "agents": [
          "Review Harvester",
          "SOI Reactivator",
          "Closing Concierge"
        ]
      }
    ],
    "connectors": [
      "MLS / RESO Web API",
      "Follow Up Boss",
      "dotloop",
      "ShowingTime",
      "Zillow Premier Agent",
      "BombBomb"
    ],
    "metrics": [
      "Speed-to-lead (avg first-touch time)",
      "Lead-to-appointment conversion %",
      "Active listings + days on market",
      "Pending-to-close ratio",
      "GCI pipeline (pending + closed)"
    ],
    "brainUse": "One shared G-Brain holds every lead's history, property notes, pricing comps, and past-client relationships so any agent answering a call or text already knows the full context.",
    "signaturePlay": "A Zillow lead hits the system at 11pm: Speed-to-Lead Bot texts within 60 seconds, qualifies budget and timeline against G-Brain, routes the hot one to the on-duty agent and books the showing in ShowingTime before the lead ever calls a competitor."
  },
  {
    "id": "persona-course-creator",
    "order": 7,
    "name": "Course Creator / Info-Product Operator",
    "archetype": "Course Creator",
    "tagline": "Cohorts, evergreen funnels, and student wins on autopilot.",
    "summary": "An info-product seller running paid cohorts and an always-on evergreen funnel. This OS variant orchestrates launches, keeps students completing the material, and harvests testimonials and affiliate revenue — so enrollments compound without the founder living in the dashboard.",
    "accent": "#f59e0b",
    "northStar": "Enrollment revenue x student completion rate (revenue that actually finishes the course)",
    "pillars": [
      {
        "name": "Funnel & Launch",
        "focus": "Evergreen funnel + live launch carts, urgency, and cart-open ops",
        "agents": [
          "Cart Sentinel",
          "Launch Conductor",
          "Webinar Bot",
          "Deadline Driver"
        ]
      },
      {
        "name": "Audience & Content",
        "focus": "Top-of-funnel content, lead magnets, and list growth that feeds the funnel",
        "agents": [
          "Lead-Magnet Bot",
          "Content Repurposer",
          "List Builder"
        ]
      },
      {
        "name": "Student Success",
        "focus": "Onboarding, completion nudges, community engagement, testimonial harvest",
        "agents": [
          "Onboarding Bot",
          "Completion Sentinel",
          "Win Harvester",
          "Community Pulse"
        ]
      },
      {
        "name": "Money & Recovery",
        "focus": "Checkout revenue, payment plans, failed-payment dunning, refund/chargeback watch",
        "agents": [
          "Checkout Pulse",
          "Dunning Bot",
          "Refund Watch"
        ]
      },
      {
        "name": "Affiliates & Partners",
        "focus": "Affiliate recruiting, swipe copy, commission tracking, JV launch ops",
        "agents": [
          "Affiliate Recruiter",
          "Commission Bot",
          "Swipe Smith"
        ]
      }
    ],
    "connectors": [
      "Kajabi",
      "ThriveCart",
      "ConvertKit",
      "Circle",
      "Deadline Funnel",
      "Stripe",
      "Zoom",
      "PartnerStack"
    ],
    "metrics": [
      "Cart conversion rate",
      "Course completion rate",
      "Email list growth + EPC",
      "Refund / chargeback rate",
      "Affiliate-driven revenue %"
    ],
    "brainUse": "Every agent reads from one shared G-Brain holding the course curriculum, swipe copy, student FAQs, objection-handling scripts, and past launch numbers — so onboarding nudges, sales replies, and affiliate swipe all speak in one consistent voice.",
    "signaturePlay": "An evergreen launch loop: Deadline Driver opens a personal-deadline cart the moment a lead finishes the webinar, Cart Sentinel fires ConvertKit sequences and Dunning Bot rescues failed payment-plan charges, while Completion Sentinel pushes the new student to module 3 and Win Harvester captures the testimonial the instant they post a win in Circle — turning one enrollment into the proof that sells the next."
  },
  {
    "id": "persona-local-service",
    "order": 8,
    "name": "Field Service OS",
    "archetype": "Home-Services Operator",
    "tagline": "Owner of the truck-and-tools shop. Every job booked, dispatched, paid.",
    "summary": "A local HVAC/plumbing/contractor owner running a fleet of trucks. This OS variant turns the phone-and-whiteboard chaos of a service business into a closed loop: a missed call becomes a booked job, a booked job becomes a routed tech, a finished job becomes a paid invoice and a 5-star review, and every customer rolls into a recurring maintenance plan.",
    "accent": "#0a85c2",
    "northStar": "Booked revenue per truck-day (jobs completed × average ticket, against capacity).",
    "pillars": [
      {
        "name": "Intake & Booking",
        "focus": "Turn every inbound call, form, and missed call into a booked job slot",
        "agents": [
          "Intake Bot",
          "Missed-Call Catcher",
          "Slot Booker"
        ]
      },
      {
        "name": "Dispatch & Field Ops",
        "focus": "Route the right tech to the right job and keep the board full",
        "agents": [
          "Dispatch Bot",
          "Route Optimizer",
          "Tech Tracker",
          "On-My-Way Texter"
        ]
      },
      {
        "name": "Quotes & Close",
        "focus": "Build estimates fast, chase pending quotes, win the job",
        "agents": [
          "Estimate Builder",
          "Quote Chaser",
          "Upsell Prompter"
        ]
      },
      {
        "name": "Money & Plans",
        "focus": "Invoice on completion, collect payment, enroll recurring maintenance",
        "agents": [
          "Invoice Closer",
          "Collections Bot",
          "Maintenance Enroller",
          "AR Sentinel"
        ]
      },
      {
        "name": "Reputation & Repeat",
        "focus": "Harvest reviews, win back lapsed customers, defend the local rank",
        "agents": [
          "Review Harvester",
          "Reputation Guard",
          "Win-Back Bot"
        ]
      }
    ],
    "connectors": [
      "Housecall Pro",
      "Jobber",
      "ServiceTitan",
      "CallRail",
      "Stripe",
      "QuickBooks Online",
      "Google Business Profile",
      "Twilio"
    ],
    "metrics": [
      "Booked revenue per truck-day",
      "Call-to-booked conversion %",
      "Average ticket",
      "Quote win rate",
      "Maintenance plan active members"
    ],
    "brainUse": "Every agent reads one shared G-Brain core holding the price book, service-area map, tech skills/certs, warranty terms, and per-customer equipment history, so quotes, dispatch, and follow-ups all speak with the same numbers and the same memory of every property.",
    "signaturePlay": "The missed-call-to-paid loop: a call that rings out at 7pm gets an instant text-back, books a next-day slot, auto-routes the nearest qualified tech, fires the \"on my way\" SMS at dawn, drops the invoice the second the job is marked complete, takes the card, and ten minutes later sends the review request — owner never touches the phone."
  },
  {
    "id": "persona-fractional-exec",
    "order": 9,
    "name": "Fractional Exec OS",
    "archetype": "Fractional Operator",
    "tagline": "One part-time exec, six client orgs, run like one shop.",
    "summary": "A fractional CFO/COO running advisory retainers across a portfolio of 6-8 client companies — selling frameworks and judgment, not hours. This OS variant keeps every retainer fed, every deliverable shipped on cadence, and every relationship warm enough to renew or refer, so utilization stays high without the operator living in their inbox.",
    "accent": "#ff6259",
    "northStar": "Monthly recurring retainer revenue (MRR) at >85% portfolio utilization",
    "pillars": [
      {
        "name": "Pipeline & Retainers",
        "focus": "Inbound leads, scoping calls, proposals, and retainer renewals",
        "agents": [
          "Scope Bot",
          "Proposal Drafter",
          "Renewal Watchdog",
          "Referral Tracer"
        ]
      },
      {
        "name": "Client Delivery",
        "focus": "Per-client workrooms, deliverables, and cadence on every active retainer",
        "agents": [
          "Engagement Lead",
          "Deliverable Forge",
          "Cadence Keeper",
          "Status Reporter"
        ]
      },
      {
        "name": "Thought Leadership",
        "focus": "LinkedIn essays, newsletter, talks — the demand engine that feeds pipeline",
        "agents": [
          "Essay Drafter",
          "Hook Miner",
          "Repurpose Bot"
        ]
      },
      {
        "name": "Practice Finance",
        "focus": "Retainer invoicing, AR aging, utilization, and effective hourly across the book",
        "agents": [
          "Invoice Runner",
          "AR Chaser",
          "Utilization Auditor"
        ]
      },
      {
        "name": "Relationship Ops",
        "focus": "Every client/prospect inbox and DM into one triaged queue with context",
        "agents": [
          "Inbox Triage",
          "Meeting Prep Bot",
          "Follow-up Sentinel"
        ]
      }
    ],
    "connectors": [
      "Attio (CRM)",
      "Gmail",
      "Calendly",
      "Notion (client workrooms)",
      "Stripe (retainer billing)",
      "QuickBooks",
      "LinkedIn",
      "Fathom (call notes)"
    ],
    "metrics": [
      "Retainer MRR",
      "Portfolio utilization %",
      "Net revenue retention",
      "Pipeline coverage (3x rule)",
      "Effective hourly rate"
    ],
    "brainUse": "Every client's frameworks, decisions, board context, and prior deliverables live in one G-Brain so any agent drafts in that client's voice and never re-asks what was already decided.",
    "signaturePlay": "After each client call, the Fathom transcript hits G-Brain, Deliverable Forge drafts the next memo/model in that client's house style, Status Reporter posts the workroom update, and Cadence Keeper books the follow-up — the engagement advances before the operator's next call ends."
  },
  {
    "id": "persona-community-operator",
    "order": 10,
    "name": "Membership Community Operator",
    "archetype": "Community Operator",
    "tagline": "Creator running a paid membership — keep them in, keep them showing up.",
    "summary": "A creator who turned an audience into a paid membership/community — recurring members, weekly live calls, a structured curriculum, and an always-on community feed. This OS variant runs the whole retention machine: it watches who's drifting, fills every event seat, keeps the content cadence on schedule, and saves at-risk subscriptions before the card declines.",
    "accent": "#8b7cff",
    "northStar": "Net MRR retention — members kept and expanded month over month",
    "pillars": [
      {
        "name": "Membership Growth",
        "focus": "Trials, waitlist, and free-to-paid conversion into the community",
        "agents": [
          "Waitlist Warden",
          "Trial Closer",
          "Referral Engine"
        ]
      },
      {
        "name": "Retention & Churn",
        "focus": "At-risk detection, dunning recovery, and cancel saves",
        "agents": [
          "Churn Sentinel",
          "Dunning Recovery Bot",
          "Win-Back Agent"
        ]
      },
      {
        "name": "Community & Engagement",
        "focus": "Daily feed health, member onboarding, and active-member streaks",
        "agents": [
          "Onboarding Concierge",
          "Engagement Pulse",
          "Ghost Hunter"
        ]
      },
      {
        "name": "Events & Live",
        "focus": "Weekly calls, RSVPs, attendance, and replay distribution",
        "agents": [
          "RSVP Wrangler",
          "Live Producer",
          "Replay Cutter"
        ]
      },
      {
        "name": "Content & Curriculum",
        "focus": "Drip schedule, lesson cadence, and member-only content pipeline",
        "agents": [
          "Drip Scheduler",
          "Curriculum Keeper",
          "Digest Writer"
        ]
      }
    ],
    "connectors": [
      "Circle",
      "Stripe Billing",
      "ConvertKit",
      "Discord",
      "Zoom Webinars",
      "Memberful",
      "Calendly",
      "G-Brain"
    ],
    "metrics": [
      "Net MRR retention",
      "Monthly churn rate",
      "Active-member rate (WAU/MAU)",
      "Live-call attendance rate",
      "Trial-to-paid conversion"
    ],
    "brainUse": "Every agent reads one shared member memory — each person's join date, tier, engagement history, last login, and save/win-back attempts — so saves, onboarding, and event nudges are personal instead of generic blasts.",
    "signaturePlay": "Churn Sentinel flags a member who hasn't logged in for 14 days and skipped two live calls, pulls their history from G-Brain, then fires a personalized win-back from Win-Back Agent and re-invites them to the next event via RSVP Wrangler — catching the lapse weeks before the renewal date instead of eating the cancel."
  },
  {
    "id": "persona-law-firm",
    "order": 11,
    "name": "Boutique Law Firm OS",
    "archetype": "Managing Attorney",
    "tagline": "Every matter moved, every hour captured, every deadline safe.",
    "summary": "A solo or small-firm managing attorney running a full caseload across intake, matter management, billing, and compliance. This OS variant turns a stack of open files into a watched docket: every deadline calculated, every billable minute captured, every trust dollar accounted for, and every client kept in the loop so nothing slips and no matter goes stale.",
    "accent": "#b8860b",
    "northStar": "Collected realization rate (billed hours that actually get paid) at zero missed deadlines",
    "pillars": [
      {
        "name": "Intake & Conflicts",
        "focus": "Screen inquiries, clear conflicts, and sign engagements",
        "agents": [
          "Intake Screener",
          "Conflict Checker",
          "Engagement Drafter",
          "Retainer Collector"
        ]
      },
      {
        "name": "Matter Management",
        "focus": "Every open matter's tasks, deadlines, and court dates on rails",
        "agents": [
          "Matter Pilot",
          "Docket Sentinel",
          "Task Router",
          "Limitations Watch"
        ]
      },
      {
        "name": "Documents & Drafting",
        "focus": "Draft, assemble, and review documents from templates and precedent",
        "agents": [
          "Draft Assembler",
          "Clause Librarian",
          "Redline Reviewer",
          "e-Filing Bot"
        ]
      },
      {
        "name": "Billing & Trust",
        "focus": "Capture time, bill on cadence, and keep trust accounting clean",
        "agents": [
          "Time Capturer",
          "Invoice Runner",
          "Trust Ledger Guard",
          "Collections Chaser"
        ]
      },
      {
        "name": "Compliance & Client Care",
        "focus": "Statutory deadlines, ethics compliance, and client communication",
        "agents": [
          "Deadline Guardian",
          "CLE Tracker",
          "Client Update Bot",
          "Review Harvester"
        ]
      }
    ],
    "connectors": [
      "Clio (practice management)",
      "LawPay",
      "NetDocuments",
      "Lexis+ / Westlaw",
      "Microsoft 365 (Outlook)",
      "DocuSign",
      "Court e-Filing (PACER / state)",
      "QuickBooks Online"
    ],
    "metrics": [
      "Realization rate (billed vs collected)",
      "Billable hours captured per attorney",
      "Matters opened vs closed",
      "Days to invoice (WIP aging)",
      "Deadline / limitations compliance (missed = 0)"
    ],
    "brainUse": "One shared G-Brain holds every matter's facts, precedent, prior filings, client history, and firm playbooks, so any agent drafts from the firm's own work product and never re-researches settled ground.",
    "signaturePlay": "A new inquiry hits the system: Conflict Checker clears it against the client and matter graph in G-Brain, Engagement Drafter generates the retainer and fee agreement in the firm's language, Retainer Collector takes the deposit through LawPay into the trust account, and Docket Sentinel opens the matter with every statutory deadline pre-calculated from the jurisdiction's rules, so the attorney reviews and signs instead of building the file from scratch."
  }
];
