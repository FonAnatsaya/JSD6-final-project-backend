import cors from "cors";
import express from "express";
import dotenv from "dotenv";
import databaseClient from "./database.mjs";
import { ObjectId } from "mongodb";
import { checkMissingFields } from "./checkMissingFields.js";
import bcrypt from "bcrypt";
import setTZ from "set-tz";
import { getISOWeek } from "date-fns";
import jwt from "jsonwebtoken";
import jwtValidate from "./src/middlewares/jwtValidate.js";
setTZ("Asia/Bangkok");

const corsOptions = {
  origin: "http://localhost:3000",
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
const ACTIVITY_KEYS = ["activityType", "hourGoal", "minuteGoal", "date"];
const TUTORIAL_KEYS = ["label", "video", "descriptions"];

const MEMBER_DATA_KEYS = ["username", "password", "phoneNumber", "email"];
const LOGIN_DATA_KEYS = ["username", "password"];
const USERS_KEYS = ["username", "birthday", "weight", "height"];

webServer.post("/checkUsername", async (req, res) => {
  let body = req.body;
  const userExist = await databaseClient
    .db()
    .collection("members")
    .findOne({ username: body.username });
  if (userExist) {
    return res.json({ isUsernameExist: true });
  } else {
    return res.json({ isUsernameExist: false });
  }
});

webServer.post("/checkEmail", async (req, res) => {
  let body = req.body;
  const userExist = await databaseClient
    .db()
    .collection("members")
    .findOne({ email: body.email });
  if (userExist) {
    return res.json({ isEmailExist: true });
  } else {
    return res.json({ isEmailExist: false });
  }
});

webServer.post("/signup", async (req, res) => {
  let body = req.body;
  const missingFields = await checkMissingFields(body, MEMBER_DATA_KEYS);
  if (missingFields.length > 0) {
    return res.status(400).json({
      message: "Validation failed. The following fields are missing values:",
      missingFields: missingFields,
    });
  }

  const saltRound = await bcrypt.genSalt(SALT);
  body["password"] = await bcrypt.hash(body["password"], saltRound);

  await databaseClient.db().collection("members").insertOne(body);
  res.json({ message: "Create User Successfully", isEmailDuplicated: false });
});

webServer.post("/login", async (req, res) => {
  try {
    let body = req.body;
    const missingFields = await checkMissingFields(body, LOGIN_DATA_KEYS);

    if (missingFields.length > 0) {
      res.status(400).json({
        message: "Validation failed. The following fields are missing values:",
        missingFields: missingFields,
      });
      return;
    }

    const user = await databaseClient
      .db()
      .collection("members")
      .findOne({ username: body.username });
    if (user === null) {
      res.json({
        message: "Username or Password not correct",
      });
      return;
    }

    if (!bcrypt.compareSync(body.password, user.password)) {
      res.json({
        message: "Username or Password not correct",
      });
      return;
    }

    const returnMember = {
      user_id: user._id,
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
    };

    const token = jwt.sign(returnMember, process.env.JWT_SECRET_KEY, {
      expiresIn: "7d",
      algorithm: "HS256",
    });

    console.log(token);

    returnMember["token"] = token;
    res.json(returnMember);
  } catch (error) {
    console.error("Error in login:", error);
    res.status(500).json({ error: "Internal Server Error", status: "error" });
  }
});

webServer.post("/activityInfoGetData", jwtValidate, async (req, res) => {
  console.log(req.body.selectedDate);
  const user_id = req.body.user_id;
  let selectedDate = req.body.selectedDate;
  selectedDate = new Date(selectedDate).toLocaleDateString();
  selectedDate = new Date(selectedDate);
  selectedDate.setHours(selectedDate.getHours() + 7);
  const activityInfo = await databaseClient
    .db()
    .collection("activityInfo")
    .find({ user_id: user_id, date: selectedDate })
    .toArray();

  res.json(activityInfo);
});

webServer.post("/activityInfoChartDonut", jwtValidate, async (req, res) => {
  try {
    console.log("selectedDate for Donut", req.body.selectedDate);
    const user_id = req.body.user_id;
    let selectedDate = req.body.selectedDate;
    selectedDate = new Date(selectedDate).toLocaleDateString();
    selectedDate = new Date(selectedDate);
    selectedDate.setHours(selectedDate.getHours() + 7);
    // console.log(user_id);
    let requestedWeek = getISOWeek(selectedDate);
    if (selectedDate.getDay() === 0) {
      // console.log("sunday");
      requestedWeek += 1;
    }
    const activityInfo = await databaseClient
      .db()
      .collection("activityInfo")
      .aggregate([
        {
          $addFields: {
            dayOfWeek: { $dayOfWeek: "$date" },
            weekOfYear: { $week: "$date" },
          },
        },
        {
          $match: {
            user_id: user_id,
            weekOfYear: { $eq: requestedWeek - 1 },
          },
        },
        {
          $group: {
            _id: "$activityType",
            total_duration: { $sum: "$actualTime" },
          },
        },
      ])
      .toArray();

    res.json({ data: activityInfo, status: "success" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error", status: "error" });
  }
});

webServer.post("/activityInfoChartBar", jwtValidate, async (req, res) => {
  try {
    // console.log(req.body.selectedDate);
    const user_id = req.body.user_id;
    let selectedDate = req.body.selectedDate;
    selectedDate = new Date(selectedDate).toLocaleDateString();
    selectedDate = new Date(selectedDate);
    selectedDate.setHours(selectedDate.getHours() + 7);
    // console.log(user_id);
    let requestedWeek = getISOWeek(selectedDate);
    if (selectedDate.getDay() === 0) {
      // console.log("sunday");
      requestedWeek += 1;
    }
    const activityInfoChartBar = await databaseClient
      .db()
      .collection("activityInfo")
      .aggregate([
        {
          $addFields: {
            dayOfWeek: { $dayOfWeek: "$date" },
            weekOfYear: { $week: "$date" },
          },
        },
        {
          $match: {
            user_id: user_id,
            weekOfYear: { $eq: requestedWeek - 1 },
          },
        },
        {
          $group: {
            _id: { dayOfWeek: "$dayOfWeek", weekOfYear: "$weekOfYear" },
            totalActualTime: { $sum: "$actualTime" },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    res.json({ data: activityInfoChartBar, status: "success" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error", status: "error" });
  }
});

webServer.post("/activityInfo", jwtValidate, async (req, res) => {
  let date = new Date(req.body.date).toLocaleDateString();
  date = new Date(date);
  date.setHours(date.getHours() + 7);
  console.log(date);

  const newActivityItem = { ...req.body, date };

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

webServer.delete("/activityInfo/:id", jwtValidate, async (req, res) => {
  const id = req.params.id;
  await databaseClient
    .db()
    .collection("activityInfo")
    .deleteOne({ _id: new ObjectId(id) });
  res.status(200).json({ message: "This activity was deleted successfully" });
});

webServer.put("/activityInfo", jwtValidate, async (req, res) => {
  let date = new Date(req.body.date).toLocaleDateString();
  date = new Date(date);
  date.setHours(date.getHours() + 7);
  const item = { ...req.body, date };
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
  await databaseClient
    .db()
    .collection("activityInfo")
    .updateOne({ _id: new ObjectId(id) }, { $set: updateItem });
  res.status(200).json({ message: "This activity was updated successfully" });
});

webServer.post("/tutorialsCreateData", jwtValidate, async (req, res) => {
  const newTutorialItem = req.body;

  const missingFields = await checkMissingFields(
    newTutorialItem,
    TUTORIAL_KEYS
  );

  if (missingFields.length > 0) {
    return res.status(400).json({
      message: "Validation failed. The following fields are missing values:",
      missingFields: missingFields,
    });
  }

  await databaseClient.db().collection("tutorials").insertOne(newTutorialItem);
  res.status(201).json({ message: "The video info was added successfully" });
});

webServer.post("/tutorialsGetData", async (req, res) => {
  const user_id = req.body.user_id;
  const videoInfo = await databaseClient
    .db()
    .collection("tutorials")
    .find({ user_id: user_id })
    .toArray();

  res.json(videoInfo);
});

webServer.delete("/tutorialsDeleteData/:id", async (req, res) => {
  const id = req.params.id;
  await databaseClient
    .db()
    .collection("tutorials")
    .deleteOne({ _id: new ObjectId(id) });
  res.status(200).json({ message: "This video was deleted successfully" });
});

webServer.put("/tutorialsUpdateData", async (req, res) => {
  const item = req.body;
  const id = req.body._id;

  const missingFields = await checkMissingFields(item, TUTORIAL_KEYS);

  if (missingFields.length > 0) {
    return res.status(400).json({
      message: "Validation failed. The following fields are missing values:",
      missingFields: missingFields,
    });
  }

  delete item._id;
  await databaseClient
    .db()
    .collection("tutorials")
    .updateOne({ _id: new ObjectId(id) }, { $set: item });
  res.status(200).json({ message: "This video was updated successfully" });
});

// add kane path get 'http://localhost:3000/users/1';
// add kane path put 'http://localhost:3000/users/editemail'
// add kane path put 'http://localhost:3000/users/editpassword'
// add kane path get 'http://localhost:3000/member/1'
// add kane path put 'http://localhost:3000/users/update'

webServer.get("/users/:id", async (req, res) => {
  const id = req.params.id;

  const user = await databaseClient
    .db()
    .collection("members")
    .findOne({ _id: new ObjectId(id) });
  res.status(200).send({
    status: "ok",
    user: user,
  });
});

webServer.put("/users/editemail", async (req, res) => {
  const user = req.body;
  const id = user.id;

  // ตรวจสอบว่ามีการส่งค่า email มาหรือไม่
  if (!user.email) {
    return res.json({ message: "Validation failed. Please input email!" });
  }

  delete user.id;
  // เรียกใช้ `updateOne`
  await databaseClient
    .db()
    .collection("members")
    .updateOne({ _id: new ObjectId(id) }, { $set: user });

  // ส่งข้อความตอบกลับ
  res.status(200).send({
    status: "ok",
    message: "User with ID = " + id + " is updated",
    user: user,
  });
});

webServer.put("/users/editpassword", async (req, res) => {
  const user = req.body;
  const id = user.id;

  // ตรวจสอบว่ามีการส่งค่า lname มาหรือไม่
  if (!user.password) {
    return res.json({ message: "Validation failed. Please input password!" });
  }

  const saltRound = await bcrypt.genSalt(SALT);
  user["password"] = await bcrypt.hash(user["password"], saltRound);

  delete user.id;
  // เรียกใช้ `updateOne`
  await databaseClient
    .db()
    .collection("members")
    .updateOne({ _id: new ObjectId(id) }, { $set: user });

  // ส่งข้อความตอบกลับ
  res.status(200).send({
    status: "ok",
    message: "User with ID = " + id + " is updated",
    user: user,
  });
});

webServer.put("/users/update", async (req, res) => {
  const user = req.body;
  const id = user.id;

  const fieldsToUpdate = {};

  // ตรวจสอบว่ามีการส่งค่า fname มาหรือไม่
  if (user.username) {
    fieldsToUpdate.username = user.username;
  }

  // ตรวจสอบว่ามีการส่งค่า lname มาหรือไม่
  if (user.birthday) {
    fieldsToUpdate.birthday = user.birthday;
  }

  if (user.gender) {
    fieldsToUpdate.gender = user.gender;
  }

  if (user.weight) {
    fieldsToUpdate.weight = user.weight;
  }

  if (user.height) {
    fieldsToUpdate.height = user.height;
  }

  if (user.avatar) {
    fieldsToUpdate.avatar = user.avatar;
  }

  const updateOptions = {
    $set: fieldsToUpdate,
  };

  // เรียกใช้ `updateOne`
  await databaseClient
    .db()
    .collection("members")
    .updateOne({ _id: new ObjectId(id) }, updateOptions);

  // ส่งข้อความตอบกลับ
  res.status(200).send({
    status: "ok",
    message: "User with ID = " + id + " is updated",
    user: user,
  });
});

const currentServer = webServer.listen(PORT, HOSTNAME, () => {
  console.log(`SERVER IS ONLINE => http://${HOSTNAME}:${PORT}`);
  console.log(
    `DATABASE IS CONNECTED: NAME => ${databaseClient.db().databaseName}`
  );
});
