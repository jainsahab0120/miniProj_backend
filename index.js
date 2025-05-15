import express from "express";
import * as dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import UserRoutes from "./routes/User.js";

dotenv.config();

const app = express();
app.use(cors({
  origin: '*',
  credentials: false 
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/user/", UserRoutes);

app.use((err, req, res) => {
  const status = err.status || 500;
  const message = err.message || "error aa gya";
  return res.status(status).json({
    success: false,
    status,
    message,
  });
});

const connectDB = () => {
  mongoose.set("strictQuery", true);
  mongoose
    .connect("mongodb+srv://jiva:jiva@cluster0.sndoa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => {
      console.error("Failed to connect to MongoDB");
      console.error(err);
    });
};

const startServer = async () => {
  try {
    await connectDB();
    app.listen(8080, () => console.log("Server started on port 8080"));
  } catch (err) {
    console.log(err);
  }
};

startServer();
