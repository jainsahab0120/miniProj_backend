import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { createError } from "../error.js";
import User from "../models/User.js";
import Workout from "../models/Workout.js";

dotenv.config();

export const UserRegister = async (req, res, next) => {
  try {
    const { email, password, name, img } = req.body;
    const existingUser = await User.findOne({ email }).exec();
    if (existingUser) {
      return next(createError(409, "Email is already in use."));
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    const user = new User({
      name,
      email,
      password: hashedPassword,
      img,
    });
    const createdUser = await user.save();
    const token = jwt.sign({ id: createdUser._id }, "secretkey", {
      expiresIn: "9999 years",
    });
    return res.status(200).json({ token, user });
  } catch (error) {
    return next(error);
  }
};

export const UserLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email });
    // user exist krta hai 
    if (!user) {
      return next(createError(404, "User not found"));
    }
    console.log(user);
    // kya password hai 
    const isPasswordCorrect = await bcrypt.compareSync(password, user.password);
    if (!isPasswordCorrect) {
      return next(createError(403, "Incorrect password"));
    }

    const token = jwt.sign({ id: user._id }, "secretkey", {
      expiresIn: "9999 years",
    });

    return res.status(200).json({ token, user });
  } catch (error) {
    return next(error);
  }
};

export const getUserDashboard = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const user = await User.findById(userId);
    if (!user) {
      return next(createError(404, "User not found"));
    }

    const currentDate = new Date();
    const startToday = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate()
    );
    const endToday = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate() + 1
    );

   
    const totalCaloriesBurnt = await Workout.aggregate([
      { 
        $match: { 
          user: user._id, 
          date: { $gte: startToday, $lt: endToday } 
        } 
      },
      {
        $group: {
          _id: null,
          totalCaloriesBurnt: { 
            $sum: { 
              $multiply: ["$duration", "$weight", 5] 
            } 
          },
        },
      },
    ]);

 
    const totalWorkouts = await Workout.countDocuments({
      user: userId,
      date: { $gte: startToday, $lt: endToday },
    });

  
    const avgCaloriesBurntPerWorkout = totalCaloriesBurnt.length > 0
      ? Math.round(totalCaloriesBurnt[0].totalCaloriesBurnt / totalWorkouts)
      : 0;

   
    const categoryCalories = await Workout.aggregate([
      { 
        $match: { 
          user: user._id,
          date: { $gte: startToday, $lt: endToday } 
        } 
      },
      {
        $group: {
          _id: "$category",
          value: { 
            $sum: { 
              $multiply: ["$duration", "$weight", 5] 
            } 
          }
        }
      },
      {
        $project: {
          id: "$_id",
          label: "$_id",
          value: 1,
          _id: 0
        }
      }
    ]);

  
    const weeklyData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const dayData = await Workout.aggregate([
        {
          $match: {
            user: user._id,
            date: { 
              $gte: dayStart, 
              $lt: dayEnd 
            }
          }
        },
        {
          $group: {
            _id: null,
            calories: { 
              $sum: { 
                $multiply: ["$duration", "$weight", 5] 
              } 
            }
          }
        }
      ]);

      weeklyData.push({
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        calories: dayData[0]?.calories || 0
      });
    }

   
    return res.status(200).json({
      totalCaloriesBurnt: totalCaloriesBurnt[0]?.totalCaloriesBurnt || 0,
      totalWorkouts,
      avgCaloriesBurntPerWorkout,
      pieChartData: categoryCalories,
      weeklyData: {
        labels: weeklyData.map(d => d.day),
        calories: weeklyData.map(d => d.calories)
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getWorkoutsByDate = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const user = await User.findById(userId);
    let date = req.query.date ? new Date(req.query.date) : new Date();
    if (!user) {
      return next(createError(404, "User not found"));
    }
    const startOfDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );
    const endOfDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + 1
    );

    const todaysWorkouts = await Workout.find({
      userId: userId,
      date: { $gte: startOfDay, $lt: endOfDay },
    });
    const totalCaloriesBurnt = todaysWorkouts.reduce(
      (total, workout) => total + workout.caloriesBurned,
      0
    );

    return res.status(200).json({ todaysWorkouts, totalCaloriesBurnt });
  } catch (err) {
    next(err);
  }
};

export const addWorkout = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { workoutString } = req.body;

    if (!workoutString) {
      return next(createError(400, "Workout string is missing"));
    }

   
    const workoutLines = workoutString.split('\n').map(line => line.trim());
    
    if (workoutLines.length < 5) {
      return next(createError(400, "Invalid workout format"));
    }

    const category = workoutLines[0].substring(1); 
    const workoutData = {
      user: userId,
      category,
      workoutName: workoutLines[1],
      sets: parseInt(workoutLines[2].split('x')[0]),
      reps: parseInt(workoutLines[2].split('x')[1]),
      weight: parseFloat(workoutLines[3]),
      duration: parseInt(workoutLines[4]),
      date: new Date()
    };

    const workout = await Workout.create(workoutData);
    
    res.status(201).json({
      success: true,
      workout
    });
  } catch (err) {
    next(err);
  }
};
