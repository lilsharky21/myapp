// ==========================================================================
// universe.js: the stocks the Discover screener looks through.
// About 90 of the best-known US companies, covering all 11 sectors.
// Shared by the screener page and the backend (api/screen.js).
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
];
