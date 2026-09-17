/**
 * Pool of topical prompts drip fed into the feed, a few each day, so the app
 * always has something new on top. Written in plain conversational language.
 *
 * Add to this list freely. Entries are posted once (matched by title), oldest
 * first, and the worker falls back to re surfacing existing prompts when the
 * pool runs dry, so the feed keeps rotating either way.
 */
export interface PoolPrompt {
  category: string; // category slug
  title: string;
  description: string;
  tags: string[];
}

export const DAILY_PROMPT_POOL: PoolPrompt[] = [
  // ── Technology ───────────────────────────────────────────────────────────
  {
    category: "technology",
    title: "Are AI chatbots making us worse at thinking?",
    description: "Half the internet says yes, half says that's moral panic. Where do you sit?",
    tags: ["ai", "thinking", "tech"],
  },
  {
    category: "technology",
    title: "Would you let an AI handle your job applications?",
    description: "Faster and probably better written. Also completely impersonal. Worth it?",
    tags: ["ai", "jobs", "hiring"],
  },
  {
    category: "technology",
    title: "Is your phone actually listening to you?",
    description: "Everyone has that one story about an ad showing up. Bring yours.",
    tags: ["privacy", "phones", "ads"],
  },
  {
    category: "technology",
    title: "Should kids under 16 be off social media completely?",
    description: "Some countries are already doing it. Smart policy or overreach?",
    tags: ["socialmedia", "kids", "policy"],
  },
  {
    category: "technology",
    title: "Has smartphone design completely stopped improving?",
    description: "Every launch looks like last year plus a camera bump. Convince us otherwise.",
    tags: ["phones", "design", "tech"],
  },
  {
    category: "technology",
    title: "Would you pay for an ad free internet?",
    description: "No tracking, no ads, one monthly bill. How much is that actually worth?",
    tags: ["ads", "internet", "privacy"],
  },
  // ── Sports ───────────────────────────────────────────────────────────────
  {
    category: "cricket",
    title: "Who should captain India in the next World Cup?",
    description: "Everyone has a name in mind. Say yours and defend it.",
    tags: ["india", "captain", "worldcup"],
  },
  {
    category: "cricket",
    title: "Is T20 quietly ruining Test cricket?",
    description: "Better money, bigger crowds, shorter attention spans. Fair trade?",
    tags: ["t20", "test", "cricket"],
  },
  {
    category: "football",
    title: "Which club had the best transfer window?",
    description: "Big spending does not always mean smart spending. Who actually won?",
    tags: ["transfers", "clubs", "football"],
  },
  {
    category: "football",
    title: "Is the Ballon d'Or basically a popularity contest now?",
    description: "Stats say one thing, votes say another. What should really decide it?",
    tags: ["ballondor", "awards", "football"],
  },
  {
    category: "sports",
    title: "Should athletes speak up about politics?",
    description: "Platform comes with responsibility, or just stick to the sport?",
    tags: ["athletes", "politics", "sport"],
  },
  // ── Entertainment ────────────────────────────────────────────────────────
  {
    category: "movies",
    title: "What film did everyone love and you just did not get?",
    description: "Say it here, nobody knows who you are anyway.",
    tags: ["films", "hottake", "movies"],
  },
  {
    category: "movies",
    title: "Are cinemas worth the ticket price anymore?",
    description: "Big screen and popcorn, or your couch and a subscription?",
    tags: ["cinema", "streaming", "movies"],
  },
  {
    category: "tv-shows",
    title: "Which show did you quit halfway and never go back to?",
    description: "No judgement. Say which one lost you and when.",
    tags: ["tv", "shows", "quit"],
  },
  {
    category: "music",
    title: "Is live music getting too expensive to bother?",
    description: "Ticket prices keep climbing. Still worth it or has it tipped over?",
    tags: ["concerts", "tickets", "music"],
  },
  {
    category: "anime",
    title: "Which anime ending actually landed?",
    description: "Most fumble it. Name one that stuck the landing.",
    tags: ["anime", "endings"],
  },
  // ── Money & work ─────────────────────────────────────────────────────────
  {
    category: "finance",
    title: "Is buying a house still realistic for our generation?",
    description: "Rent forever or stretch for a loan. What are you actually planning?",
    tags: ["housing", "money", "rent"],
  },
  {
    category: "finance",
    title: "What is the worst money advice you have been given?",
    description: "Everyone has heard one confidently bad tip. Share it.",
    tags: ["money", "advice"],
  },
  {
    category: "technology",
    title: "Is working from home actually better, honestly?",
    description: "Not the LinkedIn answer. The real one.",
    tags: ["remote", "work", "office"],
  },
  {
    category: "finance",
    title: "Would you take a pay cut for a four day week?",
    description: "How much less would you accept for one more day off?",
    tags: ["work", "salary", "fourday"],
  },
  // ── Everyday life ────────────────────────────────────────────────────────
  {
    category: "food",
    title: "What food does everyone rave about that you find boring?",
    description: "Be brave. Somebody in here agrees with you.",
    tags: ["food", "hottake"],
  },
  {
    category: "health",
    title: "Is the gym culture online doing more harm than good?",
    description: "Motivation for some, quiet pressure for everyone else.",
    tags: ["fitness", "gym", "health"],
  },
  {
    category: "travel",
    title: "Which famous place was a total letdown?",
    description: "The photos lied. Which one got you?",
    tags: ["travel", "overrated"],
  },
  {
    category: "education",
    title: "Did school actually prepare you for anything useful?",
    description: "Be specific about what you wish they had taught instead.",
    tags: ["school", "education"],
  },
  {
    category: "random",
    title: "What is something you changed your mind about recently?",
    description: "Rare on the internet. Let's hear it.",
    tags: ["opinions", "change"],
  },
  {
    category: "random",
    title: "What small thing instantly ruins your day?",
    description: "The pettier the better honestly.",
    tags: ["daily", "pet peeves"],
  },
  {
    category: "politics",
    title: "Does protesting still change anything?",
    description: "Or has it become background noise? Say what you think.",
    tags: ["protest", "politics"],
  },
  {
    category: "science",
    title: "Would you actually go to Mars if you could?",
    description: "One way ticket, no coming back. Yes or no, and why?",
    tags: ["mars", "space"],
  },
  {
    category: "gaming",
    title: "Which game do you keep reinstalling?",
    description: "The one you always come back to no matter what else is out.",
    tags: ["games", "replay"],
  },
  {
    category: "books",
    title: "What book did you finish just out of stubbornness?",
    description: "Hated it but refused to stop. Which one?",
    tags: ["books", "reading"],
  },
];
