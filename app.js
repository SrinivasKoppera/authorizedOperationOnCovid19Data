const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running at http://localhost:3000");
    });
  } catch (error) {
    console.log(`Database Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//User Register API
app.post("/register/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `
    SELECT 
        *
    FROM
        user
    WHERE 
        username = '${username}';`;
  const userStatus = await db.get(selectUserQuery);
  if (userStatus !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 5) {
      response.status(400);
      response.send("Password to short");
    } else {
      const createUserQuery = `
        INSERT INTO
            user(username, name, password, gender, location)
        VALUES
            ('${username}', '${name}', '${hashedPassword}', '${gender}', '${location}');`;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  }
});

//Login User API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT
        *
    FROM 
        user
    WHERE
        username = '${username}';`;
  const userStatusInDB = await db.get(selectUserQuery);
  if (userStatusInDB === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPassword = await bcrypt.compare(password, userStatusInDB.password);
    if (isPassword === true) {
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "abcdefghijkl");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Middle ware function for authentication of Access Token
const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "abcdefghijkl", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};
//Convert Db object to Response Object
const convertBDObjTORepObj = (obj) => {
  return {
    stateId: obj.state_id,
    stateName: obj.state_name,
    population: obj.population,
  };
};

//2.GET States API
app.get("/states/", authenticationToken, async (request, response) => {
  const selectStatesQuery = `SELECT * FROM state;`;
  const allStatesFromDB = await db.all(selectStatesQuery);
  response.send(
    allStatesFromDB.map((eachOne) => {
      return convertBDObjTORepObj(eachOne);
    })
  );
});

//3. GET Specific State API
app.get("/states/:stateId/", authenticationToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
    SELECT 
        *
    FROM
        state
    WHERE 
        state_id = ${stateId};`;
  const dbResponse = await db.get(getStateQuery);
  response.send(convertBDObjTORepObj(dbResponse));
});

//4 Create A district in the district table API
app.post("/districts/", authenticationToken, async (request, response) => {
  const districtDetails = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;
  const addDistrictQuery = `
    INSERT INTO
        district ( district_name, state_id, cases, cured, active, deaths)
    VALUES
        (
            '${districtName}',
            ${stateId},
            ${cases},
            ${cured},
            ${active},
            ${deaths}
        );`;
  const dbResponse = await db.run(addDistrictQuery);
  response.send("District Successfully Added");
});

//Convert District Details DB obj to Resp Obj
const convertDistrictDbObjToResponseObj = (obj) => {
  return {
    districtId: obj.district_id,
    districtName: obj.district_name,
    stateId: obj.state_id,
    cases: obj.cases,
    cured: obj.cured,
    active: obj.active,
    deaths: obj.deaths,
  };
};

//5. GET Specific District Details API
app.get(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
        SELECT
            *
        FROM
            district
        WHERE
            district_id = ${districtId};`;
    const dbRep = await db.get(getDistrictQuery);
    response.send(convertDistrictDbObjToResponseObj(dbRep));
  }
);

//6. DELETE District API
app.delete(
  "/districts/:districtId",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
        DELETE FROM
            district
        WHERE
            district_id = ${districtId};`;
    const deleteDistrict = await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);
//7. UPDATE the District Details API
app.put(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const updatedDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = updatedDetails;
    const updateDistrictQuery = `
        UPDATE 
            district
        SET
            district_name = '${districtName}',
            state_id = ${stateId},
            cases = ${cases},
            cured = ${cured},
            active = ${active},
            deaths = ${deaths};`;
    const resp = await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

//8. GET the statistics of total cases, cured, active, deaths of a specific state based on state ID API
app.get(
  "/states/:stateId/stats/",
  authenticationToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStaticsQuery = `
        SELECT
            SUM(cases) AS totalCases,
            SUM(cured) AS totalCured,
            SUM(active) AS totalActive,
            SUM(deaths) AS totalDeaths
        FROM
            district
        WHERE 
            state_id = ${stateId};`;
    const stateStatics = await db.get(getStaticsQuery);
    response.send(stateStatics);
  }
);

module.exports = app;
