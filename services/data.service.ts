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

function generateContext(userId: string): string {
  const userData = platform_database[userId];
  if (!userData) {
    return "No context available for the given user.";
  }

  let context = "";

  if (userData.role === "developer") {
    context += `Developer Profile:\n`;
    context += `- Active Game: ${userData.active_game || "Unknown"}\n`;
    context += `- Progress: ${userData.progress || "Unknown"}\n`;
    context += `- Completed Games: ${userData.completed_games?.join(", ") || "None"}\n`;
  } else if (userData.role === "buyer") {
    context += `Buyer Profile:\n`;
    context += `- Favourite Game: ${userData.favourite_game || "Unknown"}\n`;
    context += `- Budget: $${userData.budget || "Unknown"}\n`;
    context += `- Completed Games: ${userData.completed_games?.join(", ") || "None"}\n`;
  }

  return context;
}

export { generateContext };