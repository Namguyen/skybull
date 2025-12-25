const platform_database = {
  "dev_user": {
    "role": "developer",
    "active_game": "SkyRunner",
    "progress": "40%",
    "completed_games": ["StarQuest", "MoonLander"],
    "views": {"yesterday": 23, "last_7_days": 150}
  },
  "dev_user_2": {
    "role": "developer",
    "active_game": "Dragon Quest",
    "progress": "75%",
    "completed_games": ["Pixel Adventure"],
    "views": {"yesterday": 0, "last_7_days": 5}
  },
  "buyer_1": {
    "role": "buyer",
    "favourite_game": "Call of Duty",
    "budget": "900",
    "completed_games": ["Indie Cat", "Space Explorer"]
  },
  "buyer_2": {
    "role": "buyer",
    "favourite_game": "The Witcher 3",
    "budget": "1200",
    "completed_games": ["Wars of Immortals", "Fantasy Land"]
  },
};

export { platform_database };

function generateContext() {
  let context = "";
  const userData = {
    favourite_game: "Unknown",
    budget: 0,
    completed_games: []
  };
  const gaming_knowledge = {};

  context += `
Buyer Profile:
- Favourite Game: ${userData.favourite_game}
- Budget: $${userData.budget}
- Completed Games: ${userData.completed_games.join(", ")}
`;

  // Add general gaming knowledge
  context += "\nGeneral Gaming Knowledge:\n";
  for (const [key, value] of Object.entries(gaming_knowledge)) {
    if (typeof value === "string") {
      context += `- ${key}: ${value}\n`;
    } else if (typeof value === "object") {
      context += `- ${key}:\n`;
      for (const [subKey, subValue] of Object.entries(value)) {
        context += `  - ${subKey}: ${subValue}\n`;
      }
    }
  }

  return context;
}

export { generateContext };