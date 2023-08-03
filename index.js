const express = require("express");
const cors = require("cors");
const port = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { query } = require("express");
const nodemailer = require("nodemailer");
const mailgunTransport = require("nodemailer-mailgun-transport");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DBUser}:${process.env.DBPassword}@cluster0.kvqywrf.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri);
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    const consultationCollection = client
      .db("university-project")
      .collection("consultation");
    const doctorsCollection = client
      .db("university-project")
      .collection("doctors");
    const bookingsCollection = client
      .db("university-project")
      .collection("bookings");
    const usersCollection = client.db("university-project").collection("users");
    const paymentCollection = client
      .db("university-project")
      .collection("payments");
    const prescriptionCollection = client
      .db("university-project")
      .collection("prescription");

    //NOTE:  make sure you use varifyAdmin after verifyJWT
    const verifyJWT = async (req, res, next) => {
      // console.log("inside verifyJWT", req.headers.authorization);
      const authHeader = req.headers.authorization;

      // const decodedEmail = req.decoded.email;
      // const query = { email: decodedEmail };
      // const user = await usersCollection.findOne(query);

      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = authHeader.split(" ")[1];

      jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
          return res.status(403).send({ message: "forbidden access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    //prescription

    app.post("/prescription", async (req, res) => {
      const prescription = req.body;
      const result = await prescriptionCollection.insertOne(prescription);
      res.send(result);
    });

    app.get("/prescriptions", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      // console.log(email)
      // console.log('token', req.headers.authorization);
      const query = { patientEmail: email };
      // console.log(query);
      const prescriptions = await prescriptionCollection.find(query).toArray();
      res.send(prescriptions);
    });

    //mail
    // const mailgunOptions = {
    //     auth: {
    //       api_key: '1b803715634f0b1cc5bbd837ae83f96e-07ec2ba2-8b882da8',
    //       domain: 'sandboxec53d94373d542a890c5c6726e9fa241.mailgun.org'
    //     }
    //   };
    //   const mailgunTransporter = nodemailer.createTransport(mailgunTransport(mailgunOptions));

    const mailgunOptions = {
      auth: {
        api_key: "1b803715634f0b1cc5bbd837ae83f96e-07ec2ba2-8b882da8",
        domain: "sandboxec53d94373d542a890c5c6726e9fa241.mailgun.org",
      },
    };
    const mailgunTransporter = nodemailer.createTransport(
      mailgunTransport(mailgunOptions)
    );

    app.post("/send-email", (req, res) => {
      const { button, doctorEmail, patientEmail } = req.body;

      if (button === "absent") {
        sendEmail(
          doctorEmail,
          patientEmail,
          "Absent!!! You have missed the appointment",
          "Dear Patient, you were absent for your appointment."
        );
      } else if (button === "visit") {
        sendEmail(
          doctorEmail,
          patientEmail,
          "Congratulations",
          "Dear Patient, You have successfully visited your doctor. Further query mail me directly or book me from Doctorian"
        );
      }

      res.json({ message: "Email sent successfully!" });
    });

    async function sendEmail(from, to, subject, message) {
      const mailOptions = {
        from: from,
        to: to,
        subject: subject,
        text: message,
      };

      await mailgunTransporter.sendMail(mailOptions);
    }

    // consultation data
    app.get("/consultation", async (req, res) => {
      const query = {};
      const consultation = await consultationCollection.find(query).toArray();
      res.send(consultation);
    });

    // consultation with id
    app.get("/consult/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { id: id };
      const consult = await doctorsCollection.find(query).toArray();
      res.send(consult);
    });
    // get doctors basis on speciality
    app.get("/specialities/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { specialities: speciality };
      const doctors = await doctorsCollection.find(query).toArray();
      res.send(doctors);
    });
    // ----------------------------------------------------
    // For Add Doctor route
    // ------------------------------------------------------
    // doctors info for add doctor route
    app.get("/doctorsInfo", async (req, res) => {
      const query = {};
      const result = await doctorsCollection
        .find(query)
        .project({ _id: 0, slots: 1 })
        .toArray();
      res.send(result);
    });

    app.get("/allDoctorsInfo", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await doctorsCollection.find(query).toArray();
      res.send(result);
    });

    //use aggregate to query multiple collection and then merge data
    //get all doctors
    app.get("/doctors", async (req, res) => {
      const date = req.query.date;
      const search = req.query.search;
      console.log(search);
      let query = {};
      if (search.length) {
        query = {
          $text: {
            $search: search,
          },
        };
      }
      const doctors = await doctorsCollection.find(query).toArray();

      //get the booking of the provided date
      const bookingQuery = { appointmentDate: date };
      const bookedSlot = await bookingsCollection.find(bookingQuery).toArray();
      // query for removing booked slot and show available slot
      doctors.forEach((doctor) => {
        const slotBooked = bookedSlot.filter(
          (book) => book.doctorName === doctor.name
        );
        const bookedSlots = slotBooked.map((book) => book.slot);
        const remainingSlots = doctor.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        doctor.slots = remainingSlots;
        // console.log(date, doctor.name, remainingSlots.length);
      });
      res.send(doctors);
    });

    // get single doctor basis on id
    app.get("/doctor-details/:id", async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const doctor = await doctorsCollection.findOne(query);
      res.send(doctor);
    });

    // post booking data to database
    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      // console.log(booking);
      const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.patientEmail,
        doctor: booking.doctorName,
      };
      // console.log(query);
      const alreadyBooked = await bookingsCollection.find(query).toArray();

      if (alreadyBooked.length) {
        const message = `You  Already have an Booking on ${booking.appointmentDate}`;
        return res.send({ acknowledged: false, message });
      }
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });
    // jwt token access for user
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "7d",
        });
        return res.send({ accessToken: token });
      }
      console.log(user);
      res.status(403).send({ accessToken: "" });
    });

    // get all users from data base
    app.get("/users", async (req, res) => {
      const query = {};
      const users = await usersCollection.find(query).toArray();
      res.send(users);
    });

    // save users data to database
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    //doctor route only
    app.get("/users/doctor/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ isDoctor: user?.category === "Doctor" });
    });

    // patient only route
    app.get("/users/patient/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ isPatient: user?.category === "Patient" });
    });

    // secure admin route by varify admin
    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.category === "admin" });
    });

    // Make users admin
    app.put("/users/admin/:id", verifyJWT, async (req, res) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);

      if (user?.category !== "admin") {
        return res.send(403).send({ message: "forbidden access" });
      }
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          category: "admin",
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    // ----------------------------------------------------------------------
    // Doctors sides
    // ----------------------------------------------------------------------
    //  send doctors info to database
    app.post("/doctors", async (req, res) => {
      const doctor = req.body;
      const result = await doctorsCollection.insertOne(doctor);
      res.send(result);
    });

    app.put("/doctors", async (req, res) => {
      const doctor = req.body;
      const email = req.query.email;
      const filter = { email: email };
      const option = { upsert: true };
      const updatedName = {
        $set: {
          designation: doctor.designation,
          hospital: doctor.hospital,
          TotalExperience: doctor.TotalExperience,
          specialities: doctor.specialities,
          id: doctor.id,
          price: doctor.price,
          About: doctor.About,
          image: doctor.image,
        },
      };
      const result = await doctorsCollection.updateOne(
        filter,
        updatedName,
        option
      );
      res.send(result);
    });

    // specific patient for doctor dashboard
    app.get("/doctor-appointment", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { doctorEmail: email };
      // console.log(query);
      const myPatient = await bookingsCollection.find(query).toArray();
      res.send(myPatient);
    });

    // ----------------------------------------------------------------

    // get user booking data to dashboard
    app.get("/bookings", async (req, res) => {
      const email = req.query.email;
      // const decodedEmail = req.decoded.email;
      // if (email !== decodedEmail) {
      //   return res.status(403).send({ message: "forbidden access" });
      // }
      // console.log(email)
      // console.log('token', req.headers.authorization);
      const query = { patientEmail: email };
      // console.log(query);
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
    });

    // get specific booking data from db

    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const booking = await bookingsCollection.findOne(query);
      res.send(booking);
    });

    // payment section
    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100;

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // store payment data to DB
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      const id = payment.bookingID;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const updatedResult = await bookingsCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(result);
    });

    //all doctors to show admin route

    app.get('/allDoctorsAdmin', async (req, res) => {
      const query = {}
      const doctors = await doctorsCollection.find(query).toArray();
      res.send(doctors)
    })


       //verifyAdmin
       const verifyAdmin = async (req, res, next) => {
        const decodedEmail = req.decoded.email;
        const query = { email: decodedEmail };

        const user = await usersCollection.findOne(query);
        if (user?.category !== 'admin') {
            return res.status(403).send({ message: 'forbidden Access' });
        }
        next();
    }

    app.put('/allDoctorsAdmin/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = {_id: new  ObjectId(id)}
      const options = { upsert: true };
      const updatedDoc = {
          $set: {
              verifyStatus: true
          }
      }
      const result = await doctorsCollection.updateOne(filter, updatedDoc, options);
      res.send(result);
  })

     //get verified sellers
     app.get('/verifiedSeller', async (req, res) => {
      const email = req.query.email;
      const query = {
          verifyStatus: true,
          email: email
      }
      const result = await doctorsCollection.findOne(query);
      res.send(result);
  })







  } finally {
  }
}
run().catch(console.log);

app.get("/", async (req, res) => {
  res.send("doctors portal server  is running");
});

app.listen(port, () => console.log(`doctors portal running on ${port}`));
