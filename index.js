import cors from "cors";
import express from "express";
import dotenv from "dotenv";
import databaseClient from "./database.mjs";
import { ObjectId } from "mongodb";
import { checkMissingFields } from "./checkMissingFields.js";
import bcrypt from "bcrypt";
const corsOptions = {
  origin: "http://localhost:8000",
  methods: "GET,POST,DELETE,PUT",
  allowedHeaders: "Content-Type,Authorization",
};

const HOSTNAME = process.env.SERVER_IP;
const PORT = process.env.SERVER_PORT;
const SALT = 10;

dotenv.config();

const webServer = express();
webServer.use(cors());
webServer.use(express.json());
const SALT = 10;
const requiredFields = ["activityType", "hourGoal", "minuteGoal", "date"];

const MEMBER_DATA_KEYS = ["username", "password","phoneNumber","email",];
const LOGIN_DATA_KEYS = ["username", "password"];

webServer.post("/signup", async (req, res) => {
  let body = req.body;
  const missingFields = await checkMissingFields(
    body,
    MEMBER_DATA_KEYS
  );

  if (missingFields.length > 0) {
    return res.status(400).json({
      message: "Validation failed. The following fields are missing values:",
      missingFields: missingFields,
    });
  }

  const saltRound = await bcrypt.genSalt(SALT);
  body["password"] = await bcrypt.hash(body["password"], saltRound);

  await databaseClient.db().collection("members").insertOne(body);
  res.send("Create User Successfully");
});


webServer.get("/activityInfo", async (req, res) => {
  const activityInfo = await databaseClient
    .db()
    .collection("activityInfo")
    .find({})
    .toArray();
  res.json(activityInfo);
});

webServer.get("/activityInfoChart", async (req, res) => {
  const activityInfo = await databaseClient
    .db()
    .collection("activityInfo")
    .aggregate([ 
      { $group: 
      { 
         _id: "$activityType", 

         total_duration: { $sum: "$actualTime" } 
      } 
      } 
      ])
    .toArray();
  res.json(activityInfo);
});

webServer.post("/activityInfo", async (req, res) => {
  const newActivityItem = req.body;
  const missingFields = await checkMissingFields(
    newActivityItem,
    ACTIVITY_KEYS
  );

  if (missingFields.length > 0) {
    return res.status(400).json({
      message: "Validation failed. The following fields are missing values:",
      missingFields: missingFields,
    });
  }

  await databaseClient
    .db()
    .collection("activityInfo")
    .insertOne(newActivityItem);
  res.status(201).json({ message: "Activity info was added successfully" });
});

webServer.delete("/activityInfo/:id", async (req, res) => {
  const id = req.params.id;
  await databaseClient
    .db()
    .collection("activityInfo")
    .deleteOne({ _id: new ObjectId(id) });
  res.status(200).json({ message: "This activity was deleted successfully" });
});

webServer.put("/activityInfo", async (req, res) => {
  console.log(req.body);
  const item = req.body;
  const id = req.body._id;

  const missingFields = await checkMissingFields(item, ACTIVITY_KEYS);

  if (missingFields.length > 0) {
    return res.status(400).json({
      message: "Validation failed. The following fields are missing values:",
      missingFields: missingFields,
    });
  }

  const dataItem = await databaseClient
    .db()
    .collection("activityInfo")
    .findOne({ _id: new ObjectId(id) });
  console.log(dataItem);

  let updateItem = {};
  if (dataItem?.actualTime) {
    updateItem = { ...item, actualTime: dataItem.actualTime };
  } else {
    updateItem = item;
  }
  delete updateItem._id;
  console.log(updateItem);
  await databaseClient
    .db()
    .collection("activityInfo")
    .updateOne({ _id: new ObjectId(id) }, { $set: updateItem });
  res.status(200).json({ message: "This activity was updated successfully" });
});

const currentServer = webServer.listen(PORT, HOSTNAME, () => {
  console.log(`SERVER IS ONLINE => http://${HOSTNAME}:${PORT}`);
  console.log(
    `DATABASE IS CONNECTED: NAME => ${databaseClient.db().databaseName}`
  );
});
