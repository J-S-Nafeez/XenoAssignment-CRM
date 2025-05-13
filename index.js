const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const passport = require("passport");
const session = require("express-session");
const cors = require("cors");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { Configuration, OpenAIApi } = require("openai");

dotenv.config();
const app = express();
app.use(express.json());

// ======= Enable CORS ======= //
app.use(cors({
  origin: "http://localhost:3000", // Frontend URL
  credentials: true,
}));

// ======= MongoDB Connection ======= //
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ======= Express Session ======= //
app.use(session({
  secret: process.env.SESSION_SECRET || "xeno_secret_key",
  resave: false,
  saveUninitialized: false,
}));

// ======= Passport Setup ======= //
app.use(passport.initialize());
app.use(passport.session());

// ======= Mongoose Models ======= //
const User = mongoose.model("User", new mongoose.Schema({
  spend: Number,
  visits: Number,
  lastOrderDate: Date,
}));

const Campaign = mongoose.model("Campaign", new mongoose.Schema({
  name: String,
  rules: Array,
  logic: String,
  audienceSize: Number,
  sent: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
}, { timestamps: true }));

const CommunicationLog = mongoose.model("CommunicationLog", new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  status: { type: String, enum: ["sent", "failed"], default: "sent" },
  timestamp: { type: Date, default: Date.now }
}));

const GoogleUser = mongoose.model("GoogleUser", new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  email: String,
  name: String,
  picture: String,
}, { timestamps: true }));

// ======= Passport Google Strategy ======= //
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let existingUser = await GoogleUser.findOne({ googleId: profile.id });

    if (!existingUser) {
      existingUser = await GoogleUser.create({
        googleId: profile.id,
        email: profile.emails[0].value,
        name: profile.displayName,
        picture: profile.photos[0].value,
      });
    }

    return done(null, existingUser);
  } catch (err) {
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((user, done) => {
  done(null, user);
});

// ======= Utils ======= //
const checkUserRule = (user, rule) => {
  const { field, operator, value } = rule;
  const userVal = user[field];

  switch (operator) {
    case ">": return userVal > value;
    case "<": return userVal < value;
    case "=": return userVal === Number(value);
    default: return false;
  }
};

app.post('/api/ai-message-suggestions', (req, res) => {
  const { messageContext, userPreferences } = req.body;

  // Mock response (you can integrate OpenAI here later)
  const suggestedMessage = `📢 Based on "${messageContext}" and preferences "${userPreferences}", here's your marketing message: "🔥 Huge Discount Alert! Shop now and save big!"`;

  // Send the response back to the frontend
  res.json({ suggestedMessage });
});


// ======= Auth Routes ======= //
app.get("/auth/google", passport.authenticate("google", {
  scope: ["profile", "email"]
}));

app.get("/auth/logout", (req, res) => {
  req.logout(() => {
    res.redirect("http://localhost:3000");
  });
});

app.get("/auth/user", (req, res) => {
  res.send(req.user);
});

// ======= Campaign Logic APIs ======= //
app.post("/api/add-user", async (req, res) => {
  try {
    const { spend, visits, lastOrderDate } = req.body;
    const user = new User({ spend, visits, lastOrderDate });
    await user.save();
    res.json({ message: "User added", user });
  } catch (err) {
    res.status(500).json({ error: "Error saving user", details: err.message });
  }
});

app.post("/api/audience/preview", async (req, res) => {
  try {
    const { rules, logic } = req.body;
    const users = await User.find();
    const matchedUsers = users.filter((user) => {
      const conditions = rules.map((rule) => checkUserRule(user, rule));
      return logic === "AND" ? conditions.every(Boolean) : conditions.some(Boolean);
    });
    res.json({ audienceSize: matchedUsers.length });
  } catch (err) {
    res.status(500).json({ error: "Error fetching audience preview", details: err.message });
  }
});

app.post("/api/campaigns", async (req, res) => {
  const { name, rules, logic, audienceSize } = req.body;
  try {
    const newCampaign = new Campaign({ name, rules, logic, audienceSize });
    await newCampaign.save();
    res.status(201).json(newCampaign);
  } catch (err) {
    res.status(500).json({ error: "Error saving campaign", details: err.message });
  }
});

app.get("/api/campaigns", async (req, res) => {
  try {
    const campaigns = await Campaign.find().sort({ createdAt: -1 });
    res.status(200).json(campaigns);
  } catch (err) {
    res.status(500).json({ error: "Error fetching campaigns", details: err.message });
  }
});

app.post("/api/campaigns/:id/send", async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const users = await User.find();
    const matchedUsers = users.filter(user => {
      const conditions = campaign.rules.map(rule => checkUserRule(user, rule));
      return campaign.logic === "AND" ? conditions.every(Boolean) : conditions.some(Boolean);
    });

    let sent = 0, failed = 0;

    for (const user of matchedUsers) {
      const isSuccess = Math.random() < 0.9;
      const status = isSuccess ? "sent" : "failed";

      await CommunicationLog.create({
        campaignId: campaign._id,
        userId: user._id,
        status,
      });

      if (isSuccess) sent++;
      else failed++;
    }

    campaign.sent = sent;
    campaign.failed = failed;
    await campaign.save();

    res.json({ message: "✅ Campaign sent", sent, failed, total: matchedUsers.length });
  } catch (err) {
    res.status(500).json({ error: "Sending failed", details: err.message });
  }
});

app.get("/api/logs", async (req, res) => {
  try {
    const logs = await CommunicationLog.find()
      .populate("userId campaignId")
      .sort({ timestamp: -1 });

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: "Error fetching logs", details: err.message });
  }
});

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("http://localhost:3000/");
  }
);

// ======= Start Server ======= //
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
