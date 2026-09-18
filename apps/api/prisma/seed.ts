/**
 * Seed: categories (fixed set), curated topics w/ permanent rooms, a system
 * user + a handful of demo prompts so the feed isn't empty on first boot.
 * Idempotent — safe to re-run (upserts keyed on slugs/emails).
 *
 * Run: pnpm db:seed
 */
import { PrismaClient, RoomType } from "@prisma/client";
import { UNLIMITED_CAPACITY } from "../src/common/constants";

const prisma = new PrismaClient();

const CATEGORIES: Array<{ slug: string; name: string; icon: string }> = [
  { slug: "sports", name: "Sports", icon: "🏅" },
  { slug: "cricket", name: "Cricket", icon: "🏏" },
  { slug: "football", name: "Football", icon: "⚽" },
  { slug: "movies", name: "Movies", icon: "🎬" },
  { slug: "tv-shows", name: "TV Shows", icon: "📺" },
  { slug: "anime", name: "Anime", icon: "🌸" },
  { slug: "politics", name: "Politics", icon: "🏛️" },
  { slug: "technology", name: "Technology", icon: "💻" },
  { slug: "science", name: "Science", icon: "🔬" },
  { slug: "history", name: "History", icon: "📜" },
  { slug: "gaming", name: "Gaming", icon: "🎮" },
  { slug: "finance", name: "Finance", icon: "💰" },
  { slug: "books", name: "Books", icon: "📚" },
  { slug: "music", name: "Music", icon: "🎵" },
  { slug: "travel", name: "Travel", icon: "✈️" },
  { slug: "food", name: "Food", icon: "🍜" },
  { slug: "education", name: "Education", icon: "🎓" },
  { slug: "health", name: "Health", icon: "🩺" },
  { slug: "random", name: "Random", icon: "🎲" },
];

const TOPICS: Array<{ category: string; slug: string; title: string; trending?: boolean }> = [
  { category: "sports", slug: "fifa-world-cup-2026", title: "FIFA World Cup 2026", trending: true },
  { category: "sports", slug: "india-vs-england", title: "India vs England Series" },
  { category: "sports", slug: "ipl", title: "IPL", trending: true },
  { category: "movies", slug: "marvel", title: "Marvel" },
  { category: "movies", slug: "dc", title: "DC" },
  { category: "movies", slug: "harry-potter", title: "Harry Potter" },
  { category: "history", slug: "9-11", title: "9/11" },
  { category: "history", slug: "world-war-ii", title: "World War II" },
  { category: "technology", slug: "artificial-intelligence", title: "Artificial Intelligence", trending: true },
  { category: "technology", slug: "apple", title: "Apple" },
  { category: "technology", slug: "tesla", title: "Tesla" },
  { category: "gaming", slug: "gta-vi", title: "GTA VI", trending: true },
  { category: "finance", slug: "stock-market", title: "Stock Market" },
  { category: "science", slug: "space-exploration", title: "Space Exploration" },
  { category: "politics", slug: "global-elections", title: "Global Elections" },
  { category: "cricket", slug: "t20-world-cup", title: "T20 World Cup", trending: true },
  { category: "cricket", slug: "the-ashes", title: "The Ashes" },
  { category: "cricket", slug: "mumbai-indians", title: "Mumbai Indians" },
  { category: "cricket", slug: "chennai-super-kings", title: "Chennai Super Kings" },
  { category: "cricket", slug: "rcb", title: "Royal Challengers Bengaluru" },
  { category: "cricket", slug: "test-cricket", title: "Test Cricket" },
  { category: "cricket", slug: "indian-selection", title: "India Team Selection", trending: true },
  { category: "cricket", slug: "womens-cricket", title: "Women's Cricket" },
  { category: "football", slug: "premier-league", title: "Premier League", trending: true },
  { category: "football", slug: "champions-league", title: "Champions League", trending: true },
  { category: "football", slug: "real-madrid", title: "Real Madrid" },
  { category: "football", slug: "barcelona", title: "Barcelona" },
  { category: "football", slug: "manchester-united", title: "Manchester United" },
  { category: "football", slug: "liverpool", title: "Liverpool" },
  { category: "football", slug: "arsenal", title: "Arsenal" },
  { category: "football", slug: "manchester-city", title: "Manchester City" },
  { category: "football", slug: "ballon-dor", title: "Ballon d'Or" },
  { category: "football", slug: "transfer-window", title: "Transfer Window", trending: true },
  { category: "football", slug: "la-liga", title: "La Liga" },
  { category: "football", slug: "indian-football", title: "Indian Football" },
  { category: "sports", slug: "olympics-2028", title: "Olympics 2028" },
  { category: "sports", slug: "nba", title: "NBA", trending: true },
  { category: "sports", slug: "formula-1", title: "Formula 1", trending: true },
  { category: "sports", slug: "tennis-grand-slams", title: "Tennis Grand Slams" },
  { category: "sports", slug: "ufc", title: "UFC" },
  { category: "sports", slug: "wwe", title: "WWE" },
  { category: "sports", slug: "badminton", title: "Badminton" },
  { category: "sports", slug: "kabaddi", title: "Kabaddi" },
  { category: "movies", slug: "christopher-nolan", title: "Christopher Nolan" },
  { category: "movies", slug: "bollywood", title: "Bollywood", trending: true },
  { category: "movies", slug: "south-cinema", title: "South Indian Cinema", trending: true },
  { category: "movies", slug: "star-wars", title: "Star Wars" },
  { category: "movies", slug: "oscars", title: "The Oscars" },
  { category: "movies", slug: "horror-movies", title: "Horror Movies" },
  { category: "movies", slug: "a24", title: "A24 Films" },
  { category: "movies", slug: "james-bond", title: "James Bond" },
  { category: "tv-shows", slug: "stranger-things", title: "Stranger Things" },
  { category: "tv-shows", slug: "the-boys", title: "The Boys", trending: true },
  { category: "tv-shows", slug: "game-of-thrones", title: "Game of Thrones" },
  { category: "tv-shows", slug: "breaking-bad", title: "Breaking Bad" },
  { category: "tv-shows", slug: "friends", title: "Friends" },
  { category: "tv-shows", slug: "the-office", title: "The Office" },
  { category: "tv-shows", slug: "reality-tv", title: "Reality TV" },
  { category: "tv-shows", slug: "k-dramas", title: "K Dramas" },
  { category: "anime", slug: "one-piece", title: "One Piece", trending: true },
  { category: "anime", slug: "naruto", title: "Naruto" },
  { category: "anime", slug: "attack-on-titan", title: "Attack on Titan" },
  { category: "anime", slug: "jujutsu-kaisen", title: "Jujutsu Kaisen", trending: true },
  { category: "anime", slug: "demon-slayer", title: "Demon Slayer" },
  { category: "anime", slug: "studio-ghibli", title: "Studio Ghibli" },
  { category: "anime", slug: "solo-leveling", title: "Solo Leveling" },
  { category: "gaming", slug: "valorant", title: "Valorant", trending: true },
  { category: "gaming", slug: "minecraft", title: "Minecraft" },
  { category: "gaming", slug: "fortnite", title: "Fortnite" },
  { category: "gaming", slug: "call-of-duty", title: "Call of Duty" },
  { category: "gaming", slug: "elden-ring", title: "Elden Ring" },
  { category: "gaming", slug: "bgmi", title: "BGMI", trending: true },
  { category: "gaming", slug: "nintendo", title: "Nintendo" },
  { category: "gaming", slug: "esports", title: "Esports" },
  { category: "gaming", slug: "indie-games", title: "Indie Games" },
  { category: "technology", slug: "chatgpt", title: "ChatGPT", trending: true },
  { category: "technology", slug: "openai", title: "OpenAI", trending: true },
  { category: "technology", slug: "nvidia", title: "Nvidia" },
  { category: "technology", slug: "google", title: "Google" },
  { category: "technology", slug: "samsung", title: "Samsung" },
  { category: "technology", slug: "cybersecurity", title: "Cybersecurity" },
  { category: "technology", slug: "startups", title: "Startups", trending: true },
  { category: "technology", slug: "programming", title: "Programming" },
  { category: "technology", slug: "self-driving-cars", title: "Self Driving Cars" },
  { category: "technology", slug: "social-media", title: "Social Media", trending: true },
  { category: "science", slug: "climate-change", title: "Climate Change", trending: true },
  { category: "science", slug: "spacex", title: "SpaceX", trending: true },
  { category: "science", slug: "nasa", title: "NASA" },
  { category: "science", slug: "quantum-computing", title: "Quantum Computing" },
  { category: "science", slug: "neuroscience", title: "Neuroscience" },
  { category: "science", slug: "genetics", title: "Genetics" },
  { category: "politics", slug: "indian-politics", title: "Indian Politics", trending: true },
  { category: "politics", slug: "us-elections", title: "US Elections", trending: true },
  { category: "politics", slug: "middle-east", title: "Middle East" },
  { category: "politics", slug: "climate-policy", title: "Climate Policy" },
  { category: "politics", slug: "free-speech", title: "Free Speech" },
  { category: "finance", slug: "crypto", title: "Crypto", trending: true },
  { category: "finance", slug: "bitcoin", title: "Bitcoin" },
  { category: "finance", slug: "personal-finance", title: "Personal Finance", trending: true },
  { category: "finance", slug: "real-estate", title: "Real Estate" },
  { category: "finance", slug: "startups-funding", title: "Startup Funding" },
  { category: "finance", slug: "recession", title: "Recession Talk" },
  { category: "music", slug: "taylor-swift", title: "Taylor Swift", trending: true },
  { category: "music", slug: "hip-hop", title: "Hip Hop" },
  { category: "music", slug: "kpop", title: "K Pop", trending: true },
  { category: "music", slug: "bollywood-music", title: "Bollywood Music" },
  { category: "music", slug: "concerts", title: "Live Concerts" },
  { category: "books", slug: "fantasy-books", title: "Fantasy Books" },
  { category: "books", slug: "self-help", title: "Self Help Books" },
  { category: "food", slug: "street-food", title: "Street Food", trending: true },
  { category: "food", slug: "coffee", title: "Coffee" },
  { category: "food", slug: "vegetarian", title: "Vegetarian Food" },
  { category: "travel", slug: "solo-travel", title: "Solo Travel", trending: true },
  { category: "travel", slug: "budget-travel", title: "Budget Travel" },
  { category: "health", slug: "mental-health", title: "Mental Health", trending: true },
  { category: "health", slug: "fitness", title: "Fitness", trending: true },
  { category: "health", slug: "sleep", title: "Sleep" },
  { category: "education", slug: "exams", title: "Exams and Studying", trending: true },
  { category: "education", slug: "career-advice", title: "Career Advice", trending: true },
  { category: "random", slug: "hot-takes", title: "Hot Takes", trending: true },
  { category: "random", slug: "confessions", title: "Confessions" },
  { category: "random", slug: "would-you-rather", title: "Would You Rather" },
];

/**
 * Prompt bank (~165 titles) so the endless feed has real depth on first
 * boot. createdAt is spread over the last 30 days and counts are
 * randomized so the landing page looks alive, not freshly wiped.
 */
const PROMPT_BANK: Record<string, string[]> = {
  sports: [
    "Best football player ever?",
    "Messi vs Ronaldo: settle it once and for all",
    "Is Test cricket dying?",
    "Should the IPL have fewer teams?",
    "Greatest F1 driver of all time?",
    "Are modern footballers overpaid?",
    "India vs Australia: best rivalry in cricket?",
    "Should esports be in the Olympics?",
    "Is VAR ruining football?",
    "NBA vs football: which is the better sport to watch?",
    "Can anyone stop the current F1 dominance?",
    "Home advantage: real edge or myth?",
  ],
  movies: [
    "Most overrated movie of the decade?",
    "Marvel vs DC: who actually makes better films?",
    "Is cinema dying because of streaming?",
    "Best plot twist in movie history?",
    "Are remakes ever better than the original?",
    "Christopher Nolan: genius or overhyped?",
    "The best trilogy ever made?",
    "Do the Oscars still matter?",
    "Horror movies: art or cheap thrills?",
    "Should actors stay out of politics?",
    "Best villain ever written?",
    "Is the MCU finally over?",
  ],
  "tv-shows": [
    "Best TV finale of all time?",
    "Worst TV finale of all time?",
    "Breaking Bad vs The Wire: pick one",
    "Are reality shows scripted, and does it matter?",
    "The most rewatchable sitcom ever?",
    "Did streaming kill the weekly-episode magic?",
    "Which cancelled show deserved another season?",
    "Best opening theme in TV history?",
    "Limited series vs long-running shows: what's better?",
    "The Office vs Parks and Rec?",
  ],
  anime: [
    "Best anime of all time: one pick only",
    "Is One Piece too long to start now?",
    "Subbed vs dubbed: the eternal war",
    "Most overrated anime right now?",
    "Best anime villain ever?",
    "Do live-action adaptations ever work?",
    "Naruto vs Bleach vs One Piece: rank them",
    "Is Studio Ghibli overrated?",
    "The best anime opening ever?",
    "Which anime deserves a proper ending?",
  ],
  politics: [
    "Should voting be mandatory?",
    "Is social media destroying democracy?",
    "Term limits for all politicians: yes or no?",
    "Should political ads be banned online?",
    "Is nationalism good or dangerous?",
    "Should there be an age cap for heads of state?",
    "Does protesting actually change anything?",
    "Should billionaires exist?",
    "Is the two-party system broken beyond repair?",
    "Should Sonam Wangchuk have been detained?",
  ],
  technology: [
    "Is AI making us less creative?",
    "Is remote work better?",
    "Will AI take your job in the next 10 years?",
    "iPhone vs Android: why do people still argue?",
    "Should kids under 16 be banned from social media?",
    "Is Tesla a tech company or a car company?",
    "Are smartwatches actually useful?",
    "Is coding still worth learning in the AI era?",
    "Should AI-generated art be called art?",
    "Electric cars: revolution or hype?",
    "Is Big Tech too powerful?",
    "Do you trust AI chatbots with personal advice?",
    "The metaverse: dead or just early?",
    "Should there be a right to disconnect after work hours?",
  ],
  science: [
    "Is there intelligent life out there?",
    "Should we colonize Mars or fix Earth first?",
    "Nuclear energy: the answer to climate change?",
    "Should gene editing in humans be allowed?",
    "Is the multiverse real science or sci-fi?",
    "Are we living in a simulation?",
    "Lab-grown meat: would you eat it?",
    "Should space be privatized?",
    "Is de-extinction (bringing species back) a good idea?",
    "Climate change: are individuals or corporations responsible?",
  ],
  history: [
    "The most underrated empire in history?",
    "What single event changed history the most?",
    "Was the moon landing humanity's peak moment?",
    "Which historical figure is most overrated?",
    "If you could witness one historical event, which one?",
    "Did the industrial revolution help or hurt humanity?",
    "The best military strategist ever?",
    "What will our era be remembered for?",
    "Which lost civilization fascinates you most?",
    "World War II: was it truly unavoidable?",
  ],
  gaming: [
    "Best video game ever made?",
    "Is GTA VI going to live up to the hype?",
    "PC vs console: the forever war",
    "Are microtransactions ruining gaming?",
    "The hardest boss fight of all time?",
    "Do games count as art?",
    "Best open-world game ever?",
    "Is mobile gaming real gaming?",
    "Which game has the best story?",
    "Souls games: brilliant or just unfair?",
    "Single-player vs multiplayer: what's dying?",
    "The most disappointing game launch ever?",
  ],
  finance: [
    "Is crypto still worth investing in?",
    "Renting vs buying a home in 2026?",
    "Is the stock market just legal gambling?",
    "FIRE movement: freedom or fantasy?",
    "Should financial literacy be taught in school?",
    "Gold vs Bitcoin as a store of value?",
    "Are credit cards a trap?",
    "Is hustle culture a scam?",
    "Universal basic income: genius or disaster?",
    "What's the best first investment for a beginner?",
  ],
  books: [
    "Harry Potter vs Percy Jackson",
    "The most overrated classic novel?",
    "Do audiobooks count as reading?",
    "Best fantasy series ever written?",
    "Physical books vs e-readers?",
    "Which book changed how you see the world?",
    "Is BookTok good or bad for literature?",
    "The best plot twist in any book?",
  ],
  music: [
    "The greatest album of all time?",
    "Is autotune ruining music?",
    "Best live performer ever?",
    "Are music awards meaningless now?",
    "Vinyl revival: genuine love or aesthetic?",
    "Which decade had the best music?",
    "Is sampling creativity or theft?",
    "The most overrated artist right now?",
  ],
  travel: [
    "The most overrated tourist destination?",
    "Solo travel vs traveling with friends?",
    "Is travel influencing ruining hidden gems?",
    "Mountains or beaches: pick a side",
    "The one city everyone should visit once?",
    "Backpacking vs luxury travel: which is the real experience?",
  ],
  food: [
    "Pineapple on pizza: crime or cuisine?",
    "Is a hot dog a sandwich?",
    "The best street food country in the world?",
    "Spicy food: pleasure or pain?",
    "Home cooking vs eating out?",
    "Is veganism the future of food?",
    "The most overrated cuisine?",
    "Biryani: which city does it best?",
    "Coffee vs tea: the only debate that matters",
    "Does food taste better when someone else cooks it?",
  ],
  education: [
    "Should college be free?",
    "Are exams a good measure of intelligence?",
    "Should homework be abolished?",
    "Is a degree still worth it in 2026?",
    "Should schools teach taxes instead of trigonometry?",
    "Online learning vs classrooms: what actually works?",
  ],
  health: [
    "Is 8 hours of sleep actually necessary?",
    "Gym vs sports: the better way to stay fit?",
    "Are wellness influencers doing more harm than good?",
    "Is intermittent fasting science or fad?",
    "Should junk food ads be banned?",
    "Mental health days: legit or excuse?",
  ],
  random: [
    "What's a hill you're willing to die on?",
    "Aliens land tomorrow: what's your first question?",
    "What's the most useless superpower you'd still take?",
    "Is cereal a soup?",
    "What food do you refuse to try?",
    "If animals could talk, which species would be the rudest?",
    "What's an unpopular opinion you're proud of?",
    "Would you take a one-way ticket to Mars?",
    "What's the best purchase under $50 you've made?",
    "Time travel: 100 years forward or backward?",
    "What's something everyone loves that you can't stand?",
    "If you had to eat one meal forever, what is it?",
  ],
};

// Additional prompt bank (user-supplied): cricket, football, TV, geopolitics.
// Section headers from the source list are intentionally excluded — only real
// questions. Descriptions + tags are auto-generated below, and the randomized
// createdAt in the seeding loop interleaves ("shuffles") them into the feed.
const EXTRA_PROMPTS: Record<string, string[]> = {
  cricket: [
    // — Rohit Sharma —
    "Should Rohit Sharma play the 2027 ODI World Cup?",
    "Is Rohit still India's best ODI opener?",
    "Should Rohit's overseas record affect his legacy?",
    "Has Rohit earned the right to retire on his own terms?",
    "Should India start preparing a new ODI captain now?",
    "Is Rohit the greatest ODI opener of all time?",
    "Did Rohit silence all his critics after the Champions Trophy win?",
    "Should Rohit continue playing Test cricket?",
    "Is Rohit's World Cup captaincy underrated?",
    "Should age matter when selecting Rohit?",
    "Was Rohit's aggressive approach in ICC tournaments the right strategy?",
    "Does Rohit deserve another IPL captaincy?",
    "Is Rohit's South Africa record a concern?",
    "Is Rohit a better captain than batter?",
    "Has Rohit's fitness been unfairly criticized?",
    // — Virat Kohli —
    "Is Virat Kohli still India's best batter under pressure?",
    "Has Kohli become too defensive in ODIs?",
    "Should Kohli play until the 2027 World Cup?",
    "Is Kohli India's greatest all-format batter?",
    "Was Kohli unfairly removed as ODI captain?",
    "Does Kohli deserve one more Test captaincy stint?",
    "Has Kohli adapted his game better than anyone else?",
    "Is Kohli's legacy already untouchable?",
    "Is Kohli still the best chaser in world cricket?",
    "Would Kohli succeed as a coach after retirement?",
    "Has Kohli's IPL career affected his legacy?",
    "Is Kohli more valuable than Bumrah?",
    "Has Kohli become too reliant on singles?",
    "Is Kohli the GOAT of modern cricket?",
    "Does Kohli still deserve an automatic place in every format?",
    // — Rohit vs Kohli —
    "Rohit Sharma or Virat Kohli: who is India's greatest ODI batter?",
    "Rohit or Kohli: who is the better captain?",
    "Rohit or Kohli: who performed better in ICC tournaments?",
    "Rohit or Kohli: who had the greater impact on Indian cricket?",
    "Rohit or Kohli: who should play the 2027 World Cup?",
    "Rohit or Kohli: who is more clutch under pressure?",
    "Rohit or Kohli: who had the better peak?",
    "Rohit or Kohli: who leaves the bigger legacy?",
    "Rohit or Kohli: who transformed Indian batting more?",
    "Rohit or Kohli: who deserves more credit for India's recent ICC success?",
    "Rohit or Kohli: who is the better Test batter?",
    "Rohit or Kohli: who is the better white-ball captain?",
    "Rohit or Kohli: who has the better cricketing IQ?",
    "Rohit or Kohli: whose retirement will hurt India more?",
    "Rohit or Kohli: who makes the greatest Indian ODI XI first?",
    // — Gambhir & Coaching —
    "Should Gautam Gambhir continue as India's head coach?",
    "Should Gambhir be judged only by ICC trophies?",
    "Has Gambhir improved India's aggressive mindset?",
    "Is Gambhir too outspoken to be India's coach?",
    "Has Gambhir handled team selection well?",
    "Does Gambhir deserve credit for India's recent success?",
    "Should Gambhir get a full World Cup cycle?",
    "Has Gambhir been better than Rahul Dravid?",
    "Should Gambhir have more say in team selection?",
    "Is Gambhir's coaching style too rigid?",
    "Has Gambhir backed young players enough?",
    "Has Gambhir changed India's dressing-room culture?",
    "Is Gambhir India's best coaching appointment in years?",
    "Does Gambhir rely too much on senior players?",
    "Should Gambhir remain coach regardless of bilateral results?",
    // — Team India Selection —
    "Should Yashasvi Jaiswal open in all three formats?",
    "Should Shubman Gill be India's next all-format captain?",
    "Has KL Rahul done enough to cement his place?",
    "Should Rishabh Pant always be India's first-choice keeper?",
    "Should Sanju Samson get a longer run?",
    "Is Suryakumar Yadav underutilized in ODIs?",
    "Should India move on from Ravindra Jadeja in white-ball cricket?",
    "Is Hardik Pandya still India's most important all-rounder?",
    "Should Axar Patel play ahead of Jadeja?",
    "Does India rely too much on Jasprit Bumrah?",
    "Should Mohammed Shami still be in India's plans?",
    "Is Arshdeep Singh ready for all formats?",
    "Should Kuldeep Yadav be India's lead spinner in every format?",
    "Should India prioritize youth over experience now?",
    "Is India's bench strength the best in world cricket?",
    // — IPL vs International —
    "Does IPL performance deserve more weight than domestic cricket?",
    "Has IPL helped Indian cricket more than it has hurt?",
    "Should IPL workload decide national selection?",
    "Should centrally contracted players skip parts of the IPL?",
    "Has the IPL made Indian batters too aggressive?",
    "Is the IPL still the world's best T20 league?",
    "Should IPL captains get preference for national leadership?",
    "Does IPL success guarantee international success?",
    "Should BCCI shorten the IPL season?",
    "Has the IPL overshadowed domestic cricket?",
    // — Cricket Legacy & Hot Takes —
    "Is India's current generation stronger than the 2011 World Cup team?",
    "Is Jasprit Bumrah India's greatest fast bowler ever?",
    "Should India focus more on winning overseas Test series than ICC trophies?",
    "Is India's domestic structure producing enough match-winners?",
    "Has social media made cricket fandom too toxic?",
    "Should BCCI introduce split coaching for formats?",
    "Is winning bilateral series overrated?",
    "Should India prioritize the World Test Championship over T20Is?",
    "Is India's fear of change hurting team selection?",
    "Has India's fielding reached world-class standards?",
    "Is India's pace attack the best in its history?",
    "Which matters more: ICC trophies or long-term dominance?",
    "Should India experiment more before ICC tournaments?",
    "Has Indian cricket become too data-driven?",
    "What is the biggest challenge facing Team India over the next five years?",
  ],
  football: [
    // — Messi vs Ronaldo —
    "Lionel Messi or Cristiano Ronaldo: who is the GOAT?",
    "Would Ronaldo have won the World Cup with Argentina?",
    "Would Messi have scored more goals than Ronaldo in the Premier League?",
    "Who had the better peak: Messi or Ronaldo?",
    "Is the GOAT debate finally over after the 2022 World Cup?",
    "Who carried weaker teams more: Messi or Ronaldo?",
    "Messi or Ronaldo: who had the greater Champions League legacy?",
    "Which player changed football more: Messi or Ronaldo?",
    "Is Ronaldo's longevity more impressive than Messi's talent?",
    "Who is the greatest international player ever?",
    "Would Messi succeed in every league Ronaldo played in?",
    "Which player had tougher competition throughout their career?",
    "Will football ever see another Messi vs Ronaldo rivalry?",
    "If you could sign one player at their peak, who would it be?",
    "Whose legacy will age better over time?",
    // — Mbappé, Haaland & the new generation —
    "Kylian Mbappé or Erling Haaland: who will have the better career?",
    "Can Mbappé surpass Messi's legacy?",
    "Will Haaland ever win the Ballon d'Or?",
    "Is Lamine Yamal already among the world's top five players?",
    "Can Jude Bellingham become England's greatest midfielder?",
    "Is Vinicius Jr the best winger in football?",
    "Will Pedri fulfill his potential?",
    "Is Florian Wirtz better than Jamal Musiala?",
    "Who is the future face of football?",
    "Can any current player score 1000 career goals?",
    "Is Yamal ahead of where Messi was at the same age?",
    "Who will dominate football over the next decade?",
    "Is Haaland too dependent on service?",
    "Is Mbappé the complete modern forward?",
    "Which young player is the most overrated?",
    // — Clubs —
    "Is Real Madrid the greatest club in football history?",
    "Is Barcelona finally back among Europe's elite?",
    "Is Manchester City the best team of the modern era?",
    "Has Pep Guardiola built the greatest club side ever?",
    "Is Liverpool still Europe's biggest challenger?",
    "Is Arsenal ready to win the Champions League?",
    "Has Manchester United lost its identity?",
    "Is Chelsea's long-term project working?",
    "Is Bayern Munich still the Bundesliga's dominant force?",
    "Is PSG closer than ever to winning another Champions League?",
    "Which club has the biggest fanbase in the world?",
    "Which club has the greatest academy?",
    "Which club has the greatest history?",
    "Has money ruined football rivalries?",
    "Which club has had the best transfer business in the last five years?",
    // — Managers —
    "Is Pep Guardiola the greatest manager ever?",
    "Carlo Ancelotti or Pep Guardiola: who is the better manager?",
    "Should Mikel Arteta stay at Arsenal if he wins no trophies again?",
    "Is Xabi Alonso the next elite manager?",
    "Is Jose Mourinho underrated in today's football?",
    "Should Zinedine Zidane return to management?",
    "Has Erik ten Hag been treated unfairly?",
    "Is Luis Enrique among the world's top three managers?",
    "Who is the best tactical manager today?",
    "Which manager gets too much credit?",
    "Which manager deserves another chance at a top club?",
    "Is Guardiola's football too dependent on expensive squads?",
    "Should international managers also coach clubs?",
    "Who is the best young manager in football?",
    "Which manager would you choose for a must-win final?",
    // — Ballon d'Or & individual awards —
    "Who deserves the next Ballon d'Or?",
    "Should trophies decide the Ballon d'Or?",
    "Has the Ballon d'Or lost credibility?",
    "Should goalkeepers have a better chance of winning the Ballon d'Or?",
    "Is the Golden Boot overrated?",
    "Should defenders receive more individual recognition?",
    "Who was the most undeserving Ballon d'Or winner?",
    "Which player deserved a Ballon d'Or but never won one?",
    "Should international tournaments carry more weight in voting?",
    "Is consistency more important than trophies?",
    "Which player has been robbed of major awards?",
    "Should assists matter as much as goals?",
    "Does popularity influence football awards?",
    "Is the Ballon d'Or still football's biggest individual prize?",
    "Which player deserves more respect from fans?",
    "Which national team has the greatest football history?",
  ],
  "tv-shows": [
    "Friends or The Office?",
    "Is The Office the funniest sitcom ever?",
    "Was Michael Scott a good boss?",
    "Jim or Dwight: who is the better character?",
    "Was Ross actually toxic?",
    "Who had the best character development in Friends?",
    "Should The Office have ended after Steve Carell left?",
    "Is Chandler Bing the funniest sitcom character ever?",
    "Which sitcom has aged the best?",
    "Is Brooklyn Nine-Nine better than Friends?",
    "Was Friends overrated?",
    "Which sitcom deserves a reboot?",
    "Is How I Met Your Mother's ending worse than GOT's?",
    "Which sitcom had the strongest cast?",
    "Which TV friendship is the greatest?",
    "Is Homelander the greatest TV villain?",
    "Should The Boys end soon?",
    "Is Soldier Boy actually a villain?",
    "The Last of Us game or TV show?",
    "Did Joel make the right decision in the finale?",
    "Is Ellie the best-written TV protagonist today?",
    "Which superhero show is the best?",
    "Is Invincible better than The Boys?",
    "Which modern TV show has the best acting?",
    "Which TV show deserves more seasons?",
    "Has superhero TV peaked?",
    "Which streaming service makes the best shows?",
    "Is The Last of Us the best video game adaptation?",
    "Which TV character would survive any apocalypse?",
    "Which TV universe would you live in?",
  ],
  politics: [
    "Is the United States losing its position as the global superpower?",
    "Will China become the world's dominant power within the next decade?",
    "Is BRICS changing the global balance of power?",
    "Should the UN Security Council be reformed?",
    "Is hunger strike still an effective form of protest in modern India?",
    "Should public figures like Sonam Wangchuk lead student movements?",
    "Has Sonam Wangchuk's protest changed the national conversation?",
    "Should activists enter electoral politics?",
    "Is Sonam Wangchuk more influential than most opposition leaders?",
  ],
};

// Second extra bank — leadership, money/life, and hot-take prompts.
/**
 * Hand written prompts that should sit at the very top of the feed. Unlike the
 * generated banks these carry their own copy and get current timestamps, so
 * they lead "newest" the moment they land.
 */
/** Prompts pulled from the app: deleted on seed so they don't linger. */
const RETIRED_PROMPT_TITLES: string[] = [
  "Should postpartum psychosis change how the law judges a parent?",
  "Does India take postpartum mental health seriously at all?",
  "Is the justice system equipped to handle severe mental illness?",
];

const TOP_PROMPTS: Array<{ category: string; title: string; description: string }> = [
  // Latent / Samay Raina / standup
  {
    category: "tv-shows",
    title: "Is Latent season 2 actually bad or just getting hated on?",
    description:
      "Half the timeline decided it was over before watching. Is the drop in quality real, or is this just what happens once a show becomes a target?",
  },
  {
    category: "tv-shows",
    title: "Did Samay Raina handle the controversy well?",
    description:
      "Pulling the episodes, the apology, going quiet, then coming back. Was that damage control done right or did he cave too fast?",
  },
  {
    category: "tv-shows",
    title: "Should a comedian be responsible for what a guest says on their show?",
    description:
      "The host did not say the line. It still ended his show for months. Where does responsibility actually sit?",
  },
  {
    category: "tv-shows",
    title: "Has Indian standup gotten too scared to be funny?",
    description:
      "Every set now feels written with a screenshot in mind. Is that caution killing the comedy or just changing it?",
  },
  {
    category: "tv-shows",
    title: "Who is the best standup comedian in India right now?",
    description:
      "Not the most famous, the best. Pick one and say why everyone else is behind them.",
  },
  {
    category: "tv-shows",
    title: "Is roast comedy dead in India?",
    description:
      "AIB went down, Latent got pulled. Can anyone still do it here, or has that door closed for good?",
  },

  // Politics
  {
    category: "politics",
    title: "BJP vs Congress",
    description:
      "Forget the noise for a second. On actual delivery, which one has served the country better in the last ten years?",
  },
  {
    category: "politics",
    title: "Is the opposition in India genuinely weak or just outplayed?",
    description:
      "Bad leadership, or a machine they cannot match? There is a real difference and it decides what happens next.",
  },
  {
    category: "politics",
    title: "Do freebies win elections or wreck state finances?",
    description:
      "Every party promises them and every economist warns about them. Both cannot be right.",
  },
  {
    category: "politics",
    title: "Should there be an age limit for politicians?",
    description:
      "Pilots retire, judges retire, everyone retires. Should the people running the country?",
  },
  {
    category: "politics",
    title: "Is regional politics stronger than national politics in India?",
    description:
      "State leaders keep winning where national parties cannot. Is that the real story of Indian politics now?",
  },
  {
    category: "politics",
    title: "Has social media made Indian politics better or uglier?",
    description:
      "More people can speak than ever. Whether that improved anything is a completely separate question.",
  },

  // Tech
  {
    category: "technology",
    title: "Apple foldable vs Samsung Fold",
    description:
      "Samsung has been at this for years. Apple shows up late and everyone forgets. Who actually wins this one?",
  },

  // Criminal responsibility and mental illness
  {
    category: "politics",
    title: "Is Lindsay Clancy guilty?",
    description:
      "She does not dispute what happened. The defence is severe postpartum psychosis, so the whole case turns on whether she was criminally responsible for it. Where do you land?",
  },
  {
    category: "politics",
    title: "Is the insanity defence applied fairly?",
    description:
      "Some see it as a loophole, others as the only humane part of the system. Which is it in practice?",
  },
];

const EXTRA_PROMPTS_2: Record<string, string[]> = {
  politics: [
    "Which political leader today is the most overrated?",
    "Which political leader is the most underrated?",
    "Which leader would you trust in a national crisis?",
  ],
  finance: [
    "Would you rather earn ₹50 lakh a year or have complete freedom?",
    "Would you quit your job if you won ₹10 crore?",
    "Can money buy happiness?",
    "What's the biggest waste of money today?",
    "Would you rather own a house or travel the world?",
    "Would you retire at 35 if you could?",
    "Is hustle culture toxic?",
  ],
  education: [
    "Is success mostly luck or hard work?",
    "Is college still worth it?",
  ],
  random: [
    "What's your most unpopular opinion?",
    "Which opinion gets you judged instantly?",
    "What's something everyone pretends to enjoy?",
    "Which trend needs to disappear?",
    "Which myth do people still believe?",
    "What's the biggest scam people accept?",
    "Which generation has it the hardest?",
    "What's becoming normal that shouldn't be?",
    "Which social norm would you abolish?",
  ],
};

// ── Per-prompt description + tags ───────────────────────────────────────────
// Every prompt gets an inviting description question and 2–3 keyword tags
// (like the reference design). Derived from the title so they stay specific
// without hand-authoring 165 entries, and deterministic so re-seeds are stable.

const STOP = new Set([
  "the", "a", "an", "vs", "or", "and", "is", "are", "should", "of", "to", "in",
  "on", "for", "your", "you", "that", "this", "it", "be", "have", "make", "us",
  "we", "less", "more", "still", "just", "ever", "most", "best", "worst", "one",
  "if", "could", "would", "who", "what", "which", "how", "really", "actually",
  "genuinely", "then", "with", "was", "will", "can", "does", "do", "than",
  "into", "out", "not", "but", "get", "got", "now", "our", "his", "her",
]);

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function deriveTags(title: string, category: string): string[] {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const uniq = [...new Set(words)].slice(0, 3);
  return uniq.length ? uniq : [category];
}

function deriveDescription(title: string): string {
  const lower = title.toLowerCase();
  const pick = (arr: string[]) => arr[hash(title) % arr.length];

  if (/\bvs\b/.test(lower) || / or .*(who|better|greater|best)/.test(lower)) {
    return pick([
      "Everyone has a side on this one. Which one are you on?",
      "Pick your side and back it up.",
      "This argument never really dies. Come settle it.",
      "Two camps, ten seats. Where do you stand?",
      "Say your pick and be ready to defend it.",
    ]);
  }
  if (/^(is|are|does|do|will|can|has|have)\b/.test(lower)) {
    return pick([
      "Strong opinions welcome. Where do you land?",
      "People never agree on this. Say what you actually think.",
      "Come argue it out with nine strangers.",
      "Drop your take and see who pushes back.",
      "Half the room says yes, half says no. You?",
    ]);
  }
  if (/^should\b/.test(lower)) {
    return pick([
      "There is no clean answer here. Make your case.",
      "Yes or no, and be ready to defend it.",
      "Convince the room you're right.",
      "Easy to have an opinion, harder to defend one.",
    ]);
  }
  if (/^(what|which|who|if|when|where)\b/.test(lower)) {
    return pick([
      "Everyone answers this differently. Drop yours.",
      "No right answer, just strong ones.",
      "Say your pick out loud and see who agrees.",
      "Curious what people actually say to this one.",
    ]);
  }
  if (/^(best|greatest|most|worst|the)\b/.test(lower)) {
    return pick([
      "An impossible pick that always starts a fight.",
      "Rank it and watch the room disagree.",
      "No correct answer here, just confident ones.",
      "Everyone thinks they're right about this.",
    ]);
  }
  return pick([
    "Pull up a seat and get into it.",
    "Ten strangers, one topic. Jump in.",
    "Come say what you actually think.",
  ]);
}

async function main(): Promise<void> {
  // 1 — categories
  for (const [i, c] of CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, icon: c.icon, sortOrder: i },
      create: { ...c, sortOrder: i },
    });
  }
  const categories = await prisma.category.findMany();
  const catId = (slug: string): string => {
    const found = categories.find((c) => c.slug === slug);
    if (!found) throw new Error(`missing category: ${slug}`);
    return found.id;
  };

  // 2 — topics, each with its permanent chatroom in the same transaction
  for (const t of TOPICS) {
    await prisma.$transaction(async (tx) => {
      const topic = await tx.topic.upsert({
        where: { slug: t.slug },
        update: { title: t.title, isTrending: t.trending ?? false },
        create: {
          slug: t.slug,
          title: t.title,
          categoryId: catId(t.category),
          isTrending: t.trending ?? false,
          trendScore: t.trending ? 100 : 10,
        },
      });
      // Topic rooms are unlimited: anyone can walk in. Prompt rooms are the
      // capped, intimate ones.
      const existing = await tx.chatroom.findUnique({ where: { topicId: topic.id } });
      if (!existing) {
        await tx.chatroom.create({
          data: {
            type: RoomType.TOPIC,
            topicId: topic.id,
            capacity: UNLIMITED_CAPACITY,
          },
        });
      } else if (existing.capacity < UNLIMITED_CAPACITY) {
        await tx.chatroom.update({
          where: { id: existing.id },
          data: { capacity: UNLIMITED_CAPACITY },
        });
      }
    });
  }

  // 2.5 — remove throwaway accounts left behind by load/smoke testing so they
  // don't inflate the public user count. Deleting the user cascades to its
  // profile, messages and memberships. Scoped tightly to the test patterns.
  const throwaway = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: "@loadtest.local" } },
        { email: { endsWith: "@example.com" } },
      ],
    },
    select: { id: true, email: true },
  });
  const testPattern = /^(lt|ct|test|join|webtest|e2e)[0-9_]/i;
  const removable = throwaway.filter(
    (u) => u.email.endsWith("@loadtest.local") || testPattern.test(u.email),
  );
  if (removable.length) {
    await prisma.user.deleteMany({ where: { id: { in: removable.map((u) => u.id) } } });
    console.log(`Removed ${removable.length} leftover test accounts`);
  }

  // 3 — system account (owns demo prompts; also used for SYSTEM notices)
  const systemUser = await prisma.user.upsert({
    where: { email: "system@chatrooms.local" },
    update: {},
    create: {
      email: "system@chatrooms.local",
      provider: "EMAIL",
      emailVerified: true,
      role: "ADMIN",
      profile: {
        create: {
          username: "Chatrooms",
          usernameLower: "chatrooms",
          bio: "Official prompts to get conversations started.",
        },
      },
    },
    include: { profile: true },
  });
  const systemProfileId = systemUser.profile?.id
    ?? (await prisma.anonymousProfile.findUniqueOrThrow({ where: { userId: systemUser.id } })).id;

  // 4 — prompt bank + rooms (idempotent per title; re-runs only fill gaps)
  const rand = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;
  const DAY = 86_400_000;
  let created = 0;
  let updated = 0;
  let total = 0;

  const banks = [
    ...Object.entries(PROMPT_BANK),
    ...Object.entries(EXTRA_PROMPTS),
    ...Object.entries(EXTRA_PROMPTS_2),
  ];
  for (const [category, titles] of banks) {
    for (const title of titles) {
      total++;
      const description = deriveDescription(title);
      const tags = deriveTags(title, category);
      const existing = await prisma.prompt.findFirst({
        where: { title, creatorId: systemProfileId },
        select: { id: true },
      });
      if (existing) {
        // Backfill description/tags AND re-categorize in place — so moving a
        // title to a new category (e.g. cricket/football) takes effect on
        // re-seed instead of leaving it under its old category.
        await prisma.prompt.update({
          where: { id: existing.id },
          data: { description, tags, categoryId: catId(category) },
        });
        updated++;
        continue;
      }
      await prisma.prompt.create({
        data: {
          title,
          description,
          tags,
          categoryId: catId(category),
          creatorId: systemProfileId,
          maxUsers: 10,
          // Spread over the last 30 days so cursor pages feel like a real
          // feed; counts make cards look lived-in (workers keep them
          // honest once real traffic arrives).
          createdAt: new Date(Date.now() - rand(0, 30 * DAY)),
          messageCount: rand(0, 120),
          trendScore: rand(0, 60),
          chatroom: { create: { type: RoomType.PROMPT, capacity: 10 } },
        },
      });
      created++;
    }
  }

  // Promote whoever is listed in ADMIN_EMAILS so a real person can open the
  // analytics dashboard (the seeded system account isn't one you can log into).
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.length) {
    const promoted = await prisma.user.updateMany({
      where: { email: { in: adminEmails }, role: { not: "ADMIN" } },
      data: { role: "ADMIN" },
    });
    if (promoted.count) console.log(`Promoted ${promoted.count} admin(s)`);
  }

  // Remove retired prompts (cascades to their room and messages).
  if (RETIRED_PROMPT_TITLES.length) {
    const gone = await prisma.prompt.deleteMany({
      where: { title: { in: RETIRED_PROMPT_TITLES }, creatorId: systemProfileId },
    });
    if (gone.count) console.log(`Retired ${gone.count} prompts`);
  }

  // Hand written prompts, newest first so they lead the feed.
  let topRank = 0;
  for (const tp of TOP_PROMPTS) {
    const createdAt = new Date(Date.now() - topRank * 60_000);
    topRank++;
    const tags = deriveTags(tp.title, tp.category);
    const existing = await prisma.prompt.findFirst({
      where: { title: tp.title, creatorId: systemProfileId },
      select: { id: true },
    });
    if (existing) {
      await prisma.prompt.update({
        where: { id: existing.id },
        data: {
          description: tp.description,
          tags,
          categoryId: catId(tp.category),
          createdAt,
        },
      });
    } else {
      await prisma.prompt.create({
        data: {
          title: tp.title,
          description: tp.description,
          tags,
          categoryId: catId(tp.category),
          creatorId: systemProfileId,
          maxUsers: 10,
          createdAt,
          chatroom: { create: { type: RoomType.PROMPT, capacity: 10 } },
        },
      });
    }
  }
  console.log(`Top prompts pinned: ${TOP_PROMPTS.length}`);

  console.log("Seed complete:",
    `${CATEGORIES.length} categories, ${TOPICS.length} topics, ` +
    `${created} prompts created, ${updated} updated (of ${total})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
