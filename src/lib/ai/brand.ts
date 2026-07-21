import "server-only";

/**
 * Static business profile used by the RESEARCH stage only (Haiku).
 *
 * This is deliberately separate from the DB-sourced brand guideline
 * (buildBrandLayer / buildFormatLayer): research needs to know who Designally
 * is and which topics are in vs out of scope, but does NOT need voice, tone,
 * or formatting rules — sending those wouldn't change which trends come back
 * and can't cache on Haiku (see RESEARCH_RULES). Keep it short (~300–500
 * tokens): well under Haiku 4.5's 4,096-token minimum cacheable prefix, so no
 * cache_control is attached to the research system prompt.
 *
 * Source: Designally Brand Strategy 2026 (sections 01–09).
 * Lines marked CONFIRM are inferred from absence in that doc — verify before shipping.
 */
export const BUSINESS_PROFILE = `# Designally — business profile (research context)

## Who we are
Designally is a strategy-first creative agency in Bangkok, 6 years old, 150+ brands delivered. We build the foundation a business needs to grow — brand strategy first, then identity, website, and touchpoints. We are not a design shop that starts with aesthetics. We work bilingually in Thai and English across Bangkok, Greater Thailand, and SEA.

## Who we serve
We sell to businesses at a "Moment of Change" — Creation, Growth, or Transformation.
- Established businesses (฿50M–500M+ revenue) that have outgrown their current brand and need to justify a rebrand to a board, a family, or the market. Core fear: failing publicly.
- Growing SMEs (฿5M–80M) whose brand is not doing the selling work, so they compete on price. Core fear: wasting money.
- Marketing or brand leads inside large organisations (฿200M–5B+ employer) buying on behalf of the company. Core fear: career risk if the decision looks wrong.
- Founders (฿3M–50M) with high standards launching or relaunching. Core fear: losing control of their vision.
Decision-makers are 26–55, degree-educated, mid-to-upper income, reached via LinkedIn, Google, and referral.

## Services we sell / do
Brand strategy and positioning; brand identity and design systems; website design and build; digital touchpoints and campaign assets; ongoing brand partnership via retainer. Delivered through a four-phase process: Insights → Foundation → Touchpoints → Communication.

## Services we do NOT sell
CONFIRM: paid media buying and ad management; SEO retainers; custom software or app engineering; video and film production; PR and influencer management; one-off logo or template design with no strategy phase.

## Topics we can credibly write about
Brand strategy and positioning; rebranding and when a business has outgrown its brand; brand foundations vs. surface design; website as a business asset rather than a brochure; UX/UI and conversion; design systems and consistency; making the internal business case for brand investment; measuring brand ROI; branding for the Thai and SEA market specifically; agency-client process and how good projects actually run.

## Topics to ignore
General business, finance, HR, or lifestyle coverage with no design or brand angle; entertainment and celebrity news; performance-marketing tactics (ads, SEO, funnels) as standalone subjects; deep software engineering topics; AI tool roundups unless directly tied to design or brand work; anything aimed at pre-revenue businesses or buyers shopping for a cheap one-off deliverable.`;