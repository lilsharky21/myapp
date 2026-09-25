// ==========================================================================
// universe.js: the stocks the Discover screener looks through.
// About 200 of the best-known US companies, covering all 11 sectors:
// long-time leaders, fast growers and popular trading names.
// Shared by the screener page and the backend (api/_routes/screen.js).
// ==========================================================================

export const UNIVERSE = [
  // Tech
  ['AAPL', 'Apple', 'Tech'], ['MSFT', 'Microsoft', 'Tech'], ['NVDA', 'Nvidia', 'Tech'], ['AVGO', 'Broadcom', 'Tech'],
  ['ORCL', 'Oracle', 'Tech'], ['CRM', 'Salesforce', 'Tech'], ['ADBE', 'Adobe', 'Tech'], ['AMD', 'AMD', 'Tech'],
  ['INTC', 'Intel', 'Tech'], ['QCOM', 'Qualcomm', 'Tech'], ['TXN', 'Texas Instruments', 'Tech'], ['NOW', 'ServiceNow', 'Tech'],
  ['MU', 'Micron', 'Tech'], ['PLTR', 'Palantir', 'Tech'], ['ANET', 'Arista Networks', 'Tech'], ['CRWD', 'CrowdStrike', 'Tech'],
  ['PANW', 'Palo Alto Networks', 'Tech'], ['SHOP', 'Shopify', 'Tech'],
  // Communication
  ['GOOGL', 'Alphabet', 'Communication'], ['META', 'Meta Platforms', 'Communication'], ['NFLX', 'Netflix', 'Communication'],
  ['DIS', 'Walt Disney', 'Communication'], ['TMUS', 'T-Mobile US', 'Communication'], ['VZ', 'Verizon', 'Communication'], ['T', 'AT&T', 'Communication'],
  // Consumer discretionary
  ['AMZN', 'Amazon', 'Consumer disc.'], ['TSLA', 'Tesla', 'Consumer disc.'], ['HD', 'Home Depot', 'Consumer disc.'],
  ['MCD', "McDonald's", 'Consumer disc.'], ['NKE', 'Nike', 'Consumer disc.'], ['SBUX', 'Starbucks', 'Consumer disc.'],
  ['LOW', "Lowe's", 'Consumer disc.'], ['BKNG', 'Booking Holdings', 'Consumer disc.'], ['TJX', 'TJX Companies', 'Consumer disc.'],
  ['CMG', 'Chipotle', 'Consumer disc.'], ['UBER', 'Uber', 'Consumer disc.'],
  // Staples
  ['WMT', 'Walmart', 'Staples'], ['COST', 'Costco', 'Staples'], ['PG', 'Procter & Gamble', 'Staples'], ['KO', 'Coca-Cola', 'Staples'],
  ['PEP', 'PepsiCo', 'Staples'], ['PM', 'Philip Morris', 'Staples'], ['MDLZ', 'Mondelez', 'Staples'], ['CL', 'Colgate-Palmolive', 'Staples'],
  // Financials
  ['JPM', 'JPMorgan Chase', 'Financials'], ['BAC', 'Bank of America', 'Financials'], ['V', 'Visa', 'Financials'],
  ['MA', 'Mastercard', 'Financials'], ['BRK.B', 'Berkshire Hathaway', 'Financials'], ['GS', 'Goldman Sachs', 'Financials'],
  ['MS', 'Morgan Stanley', 'Financials'], ['AXP', 'American Express', 'Financials'], ['BLK', 'BlackRock', 'Financials'], ['SCHW', 'Charles Schwab', 'Financials'],
  // Health care
  ['LLY', 'Eli Lilly', 'Health care'], ['UNH', 'UnitedHealth', 'Health care'], ['JNJ', 'Johnson & Johnson', 'Health care'],
  ['ABBV', 'AbbVie', 'Health care'], ['MRK', 'Merck', 'Health care'], ['PFE', 'Pfizer', 'Health care'],
  ['TMO', 'Thermo Fisher', 'Health care'], ['ISRG', 'Intuitive Surgical', 'Health care'], ['AMGN', 'Amgen', 'Health care'],
  // Industrials
  ['CAT', 'Caterpillar', 'Industrials'], ['GE', 'GE Aerospace', 'Industrials'], ['HON', 'Honeywell', 'Industrials'],
  ['UNP', 'Union Pacific', 'Industrials'], ['RTX', 'RTX', 'Industrials'], ['DE', 'Deere', 'Industrials'],
  ['UPS', 'UPS', 'Industrials'], ['LMT', 'Lockheed Martin', 'Industrials'], ['BA', 'Boeing', 'Industrials'],
  // Energy
  ['XOM', 'Exxon Mobil', 'Energy'], ['CVX', 'Chevron', 'Energy'], ['COP', 'ConocoPhillips', 'Energy'],
  ['EOG', 'EOG Resources', 'Energy'], ['SLB', 'SLB', 'Energy'], ['OXY', 'Occidental', 'Energy'],
  // Materials
  ['LIN', 'Linde', 'Materials'], ['SHW', 'Sherwin-Williams', 'Materials'], ['APD', 'Air Products', 'Materials'],
  ['FCX', 'Freeport-McMoRan', 'Materials'], ['NEM', 'Newmont', 'Materials'],
  // Utilities
  ['NEE', 'NextEra Energy', 'Utilities'], ['DUK', 'Duke Energy', 'Utilities'], ['SO', 'Southern Company', 'Utilities'], ['AEP', 'American Electric Power', 'Utilities'],
  // Real estate
  ['PLD', 'Prologis', 'Real estate'], ['AMT', 'American Tower', 'Real estate'], ['EQIX', 'Equinix', 'Real estate'],
  ['O', 'Realty Income', 'Real estate'], ['SPG', 'Simon Property', 'Real estate'],
  // More Tech
  ['INTU', 'Intuit', 'Tech'], ['ADSK', 'Autodesk', 'Tech'], ['CDNS', 'Cadence Design', 'Tech'], ['SNPS', 'Synopsys', 'Tech'], ['KLAC', 'KLA', 'Tech'], ['LRCX', 'Lam Research', 'Tech'], ['AMAT', 'Applied Materials', 'Tech'], ['MRVL', 'Marvell', 'Tech'], ['ARM', 'Arm Holdings', 'Tech'], ['DELL', 'Dell', 'Tech'], ['IBM', 'IBM', 'Tech'], ['CSCO', 'Cisco', 'Tech'], ['ACN', 'Accenture', 'Tech'], ['WDAY', 'Workday', 'Tech'], ['SNOW', 'Snowflake', 'Tech'], ['NET', 'Cloudflare', 'Tech'], ['DDOG', 'Datadog', 'Tech'], ['ZS', 'Zscaler', 'Tech'], ['TTD', 'The Trade Desk', 'Tech'], ['APP', 'AppLovin', 'Tech'], ['SMCI', 'Super Micro Computer', 'Tech'], ['HPQ', 'HP', 'Tech'],
  // More Communication
  ['CMCSA', 'Comcast', 'Communication'], ['EA', 'Electronic Arts', 'Communication'], ['TTWO', 'Take-Two', 'Communication'], ['SPOT', 'Spotify', 'Communication'], ['RBLX', 'Roblox', 'Communication'], ['CHTR', 'Charter', 'Communication'],
  // More Consumer disc.
  ['ABNB', 'Airbnb', 'Consumer disc.'], ['DASH', 'DoorDash', 'Consumer disc.'], ['TGT', 'Target', 'Consumer disc.'], ['ROST', 'Ross Stores', 'Consumer disc.'], ['LULU', 'Lululemon', 'Consumer disc.'], ['DECK', 'Deckers', 'Consumer disc.'], ['F', 'Ford', 'Consumer disc.'], ['GM', 'General Motors', 'Consumer disc.'], ['RIVN', 'Rivian', 'Consumer disc.'], ['MAR', 'Marriott', 'Consumer disc.'], ['RCL', 'Royal Caribbean', 'Consumer disc.'], ['ORLY', "O'Reilly Automotive", 'Consumer disc.'],
  // More Staples
  ['MNST', 'Monster Beverage', 'Staples'], ['KDP', 'Keurig Dr Pepper', 'Staples'], ['HSY', 'Hershey', 'Staples'], ['MO', 'Altria', 'Staples'], ['KHC', 'Kraft Heinz', 'Staples'], ['DG', 'Dollar General', 'Staples'], ['CELH', 'Celsius', 'Staples'], ['ELF', 'e.l.f. Beauty', 'Staples'],
  // More Financials
  ['WFC', 'Wells Fargo', 'Financials'], ['C', 'Citigroup', 'Financials'], ['SPGI', 'S&P Global', 'Financials'], ['MCO', "Moody's", 'Financials'], ['ICE', 'Intercontinental Exchange', 'Financials'], ['CME', 'CME Group', 'Financials'], ['PGR', 'Progressive', 'Financials'], ['CB', 'Chubb', 'Financials'], ['COF', 'Capital One', 'Financials'], ['PYPL', 'PayPal', 'Financials'], ['XYZ', 'Block', 'Financials'], ['COIN', 'Coinbase', 'Financials'], ['HOOD', 'Robinhood', 'Financials'], ['SOFI', 'SoFi', 'Financials'],
  // More Health care
  ['BMY', 'Bristol-Myers Squibb', 'Health care'], ['GILD', 'Gilead', 'Health care'], ['VRTX', 'Vertex', 'Health care'], ['REGN', 'Regeneron', 'Health care'], ['DXCM', 'Dexcom', 'Health care'], ['ZTS', 'Zoetis', 'Health care'], ['CVS', 'CVS Health', 'Health care'], ['CI', 'Cigna', 'Health care'], ['ELV', 'Elevance Health', 'Health care'], ['MCK', 'McKesson', 'Health care'], ['HCA', 'HCA Healthcare', 'Health care'], ['BSX', 'Boston Scientific', 'Health care'],
  // More Industrials
  ['ETN', 'Eaton', 'Industrials'], ['EMR', 'Emerson', 'Industrials'], ['ITW', 'Illinois Tool Works', 'Industrials'], ['MMM', '3M', 'Industrials'], ['WM', 'Waste Management', 'Industrials'], ['FDX', 'FedEx', 'Industrials'], ['CSX', 'CSX', 'Industrials'], ['DAL', 'Delta Air Lines', 'Industrials'], ['NOC', 'Northrop Grumman', 'Industrials'], ['GD', 'General Dynamics', 'Industrials'], ['PH', 'Parker-Hannifin', 'Industrials'], ['AXON', 'Axon', 'Industrials'],
  // More Energy
  ['MPC', 'Marathon Petroleum', 'Energy'], ['PSX', 'Phillips 66', 'Energy'], ['VLO', 'Valero', 'Energy'], ['KMI', 'Kinder Morgan', 'Energy'], ['WMB', 'Williams', 'Energy'], ['FSLR', 'First Solar', 'Energy'],
  // More Materials
  ['NUE', 'Nucor', 'Materials'], ['ECL', 'Ecolab', 'Materials'], ['VMC', 'Vulcan Materials', 'Materials'], ['DD', 'DuPont', 'Materials'],
  // More Utilities
  ['D', 'Dominion Energy', 'Utilities'], ['EXC', 'Exelon', 'Utilities'], ['SRE', 'Sempra', 'Utilities'], ['CEG', 'Constellation Energy', 'Utilities'], ['VST', 'Vistra', 'Utilities'],
  // More Real estate
  ['WELL', 'Welltower', 'Real estate'], ['PSA', 'Public Storage', 'Real estate'], ['DLR', 'Digital Realty', 'Real estate'], ['CCI', 'Crown Castle', 'Real estate'], ['VICI', 'VICI Properties', 'Real estate'],
];
