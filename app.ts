import express from "express";
import cors from "cors";
import chatRouter from "./routes/chat";

const app = express();
app.use(express.json());
app.use(cors());

// fake auth middleware (demo)
app.use((req: any, _res, next) => {
  req.user = {
    id: "buyer_1",
    role: "buyer"
  };
  next();
});

app.use("/api", chatRouter);

app.listen(3000, () => {
  console.log("BE running at http://localhost:3000");
});
