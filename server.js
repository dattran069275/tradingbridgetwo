// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const http = require('http');
const socketIO = require('socket.io');
const axios = require('axios');
const { Sequelize, DataTypes } = require('sequelize');
const app = express();
const server = http.createServer(app);
const path = require('path'); // Import the path module
const port = process.env.PORT || 3000; // Cổng của server Node.js
let currentNumber = 60;
let currentSignal = "none";

app.use(cors());
app.use(express.json());

// Sequelize setup
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    host: process.env.PGHOST, // Use PGHOST from .env
    port: process.env.PGPORT, // Use PGPORT from .env
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false // Required for some cloud providers
        }
    },
});

// Define Models using Sequelize
const CanhBao = sequelize.define('CanhBao', {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    state: {
        type: DataTypes.STRING,
        defaultValue: 'wait'
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    lastUpdate: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

const linkSchema = sequelize.define('Link', {
    name: {
        type: DataTypes.STRING,
        defaultValue: "superTrend + easy"
    },
    linkBuy: {
        type: DataTypes.STRING,
        allowNull: false
    },
    linkSell: {
        type: DataTypes.STRING,
        allowNull: false
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    lastUpdate: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

const CanhBaoAndLink = sequelize.define('CanhBaoAndLink', {
    index: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true // Auto-increment for index
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    lastUpdate: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

// Define associations
CanhBaoAndLink.hasOne(CanhBao, { as: 'canhBao1', foreignKey: 'canhBao1Id' });
CanhBaoAndLink.hasOne(CanhBao, { as: 'canhBao2', foreignKey: 'canhBao2Id' });
CanhBaoAndLink.hasOne(linkSchema, { foreignKey: 'linkId' });

// Synchronize models with the database
sequelize.sync()
    .then(() => console.log('Đã đồng bộ hóa các models với PostgreSQL'))
    .catch(err => console.error('Lỗi đồng bộ hóa models:', err));

const io = socketIO(server, {
    cors: {
        origin: '*',
        methods: ["GET", "POST"]
    }
});

async function createLink(name, linkBuy, linkSell) {
    console.log(`createLink: [${linkBuy} ${linkSell}]`)
    try {
        const newLink = await linkSchema.create({ name, linkBuy, linkSell });
        console.log('Đã tạo link:', newLink.toJSON());
        return newLink.toJSON(); // Return JSON
    } catch (error) {
        console.error('Lỗi khi tạo link:', error);
        return null;
    }
}

async function createCanhBao(name) {
    console.log(`createCanhBao: [${name}]`)
    try {
        const newCanhBao = await CanhBao.create({ name });
        console.log('Đã tạo cảnh báo:', newCanhBao.toJSON());
        io.emit('taoCanhBaoThanhCong', newCanhBao.toJSON());
        return newCanhBao.toJSON(); // Return JSON
    } catch (error) {
        console.error('Lỗi khi tạo cảnh báo:', error);
        return null;
    }
}

async function createCanhBaoAndLink(nameCB1, nameCB2, linkBuy, linkSell) {
    console.log(`createCanhBaoAndLink: [${nameCB1} ${nameCB2} ${linkBuy} ${linkSell}]`)
    try {
        const cb1 = await CanhBao.create({ name: nameCB1 });
        const cb2 = await CanhBao.create({ name: nameCB2 });
        const newLink = await linkSchema.create({
            name: `${nameCB1} + ${nameCB2}`, // Set a name for the link
            linkBuy,
            linkSell
        });
        console.log(`cb1.id, cb1.id, cb1.id ${cb1.id} ${cb1.id} ${newLink.id}`)
        const newCanhBaoAndLink = await CanhBaoAndLink.create({
            canhBao1Id: cb1.id, // Use the IDs of the created CanhBao instances
            canhBao2Id: cb2.id,
            linkId: newLink.id,
        });
        console.log('Đã tạo cảnh báo và linknewCanhBaoAndLink :',newCanhBaoAndLink)
        console.log('Đã tạo cảnh báo và link:', newCanhBaoAndLink.toJSON());
        return newCanhBaoAndLink.toJSON();
    } catch (error) {
        console.error('Lỗi khi tạo cảnh báo:', error);
        return null;
    }
}

app.post('/createCanhBaoAndLink', async (req, res) => {
    try {
        const { nameCB1, nameCB2, linkBuy, linkSell } = req.body;
        const newCanhBaoAndLink = await createCanhBaoAndLink(nameCB1, nameCB2, linkBuy, linkSell);
        res.status(201).json(newCanhBaoAndLink);
    } catch (err) {
        res.status(500).json({ message: 'Error adding canh bao', error: err });
    }
});

async function deleteCanhBaotByIdConvenient(id) {
    try {
        const deletedCount = await CanhBaoAndLink.destroy({
            where: {
                index: id
            }
        });
        if (deletedCount > 0) {
            console.log(`Đã xóa cảnh báo ID "${id}" (Sequelize)`);
            return true;
        } else {
            console.log(`Không tìm thấy cảnh báo với ID "${id}" (Sequelize)`);
            return false;
        }
    } catch (error) {
        console.error('Lỗi khi xóa cảnh báo:', error);
        return false;
    }
}

app.post('/addCanhBao', async (req, res) => {
    try {
        const { name } = req.body;
        const newCanhBao = await createCanhBao(name);
        res.status(201).json(newCanhBao);
    } catch (err) {
        res.status(500).json({ message: 'Error adding canh bao', error: err });
    }
});

app.post('/resetState', async (req, res) => {
    const { id } = req.body;
    console.log(`resetState ${id}`)
    try {
        const updatedCanhBaoAndLink = await CanhBaoAndLink.findByPk(id, {
            include: [
                { model: CanhBao, as: 'canhBao1' },
                { model: CanhBao, as: 'canhBao2' },
            ]
        });

        if (!updatedCanhBaoAndLink) {
            return res.status(404).send({ success: false, message: 'CanhBaoAndLink not found' });
        }

        if (updatedCanhBaoAndLink.canhBao1) {
            await updatedCanhBaoAndLink.canhBao1.update({ state: "wait" });
        }
        if (updatedCanhBaoAndLink.canhBao2) {
            await updatedCanhBaoAndLink.canhBao2.update({ state: "wait" });
        }

        await updatedCanhBaoAndLink.reload(); // Reload to get updated data
        res.status(200).send({ success: true, message: 'State reset successfully', data: updatedCanhBaoAndLink.toJSON() });
        notifyClient();
    } catch (error) {
        console.error('Lỗi khi cập nhật CanhBaoAndLink:', error);
        res.status(500).send({ success: false, message: 'Error resetting state', error: error });
    }
});

function notifyClient() {
    fecthAllCanhBaoUpdated(true);
}

async function updateCanhBao(canhbaoName, state) {
    try {
        const updatedCanhBao = await CanhBao.update(
            { state: state },
            { where: { name: canhbaoName }, returning: true, plain: true }
        );

        if (updatedCanhBao[0] === 0) {
            console.log(`CanhBao with name '${canhbaoName}' not found.`);
            return null;
        }
        const updatedRecord = await CanhBao.findOne({ where: { name: canhbaoName } });
        notifyClient();
        return updatedRecord ? updatedRecord.toJSON() : null;
    } catch (err) {
        console.error("Error updating CanhBao:", err);
        return null;
    }
}

app.post('/updateLink', async (req, res) => {
    const { id, linkBuy, linkSell } = req.body;

    try {
        const updatedCanhBaoAndLink = await CanhBaoAndLink.findByPk(id, {
            include: [{ model: linkSchema }]
        });

        if (!updatedCanhBaoAndLink) {
            return res.status(404).json({ success: false, message: 'CanhBaoAndLink not found' });
        }

        await updatedCanhBaoAndLink.linkSchema.update({
            linkBuy: linkBuy,
            linkSell: linkSell,
            lastUpdate: Date.now()
        });

        await updatedCanhBaoAndLink.reload();
        res.status(200).json({ success: true, message: 'Link updated successfully', data: updatedCanhBaoAndLink.toJSON() });
        notifyClient();
    } catch (error) {
        console.error('Lỗi khi cập nhật Link:', error);
        res.status(500).json({ success: false, message: 'Error updating Link', error: error });
    }
});

app.get('/allCanhBaoAndLink', async (req, res) => {
    try {
        const allCanhBaoAndLink = await CanhBaoAndLink.findAll({
            include: [
                { model: CanhBao, as: 'canhBao1' }, // Include CanhBao với alias canhBao1
                { model: CanhBao, as: 'canhBao2' }, // Include CanhBao với alias canhBao2
                { model: linkSchema },
            ],
            order: [['index', 'ASC']]
        });
        res.json(allCanhBaoAndLink.map(item => item.toJSON())); // Chuyển đổi sang JSON trước khi trả về
    } catch (err) {
        res.status(500).json({ message: 'Error fetching allCanhBaoAndLink', error: err });
    }
});
app.get('/allCanhBaoAndLinkBT', async (req, res) => {
    try {
        const allCanhBaoAndLink = await CanhBaoAndLink.findAll({
            order: [['index', 'ASC']]
        });
        res.json(allCanhBaoAndLink.map(item => item.toJSON())); // Chuyển đổi sang JSON trước khi trả về
    } catch (err) {
        res.status(500).json({ message: 'Error fetching allCanhBaoAndLink', error: err });
    }
});
app.get('/allLinks', async (req, res) => {
    try {
        const allLinks = await linkSchema.findAll();
        res.json(allLinks.map(link => link.toJSON()));
    } catch (err) {
        res.status(500).json({ message: 'Error fetching allLinks', error: err });
    }
});

app.get('/allVariables', async (req, res) => {
    // This part is commented out because there's no Variable model defined in the Sequelize setup
    // If you need to store and fetch variables, you will need to define a Variable model and its corresponding database table
    res.status(501).json({ message: 'Not implemented: Variable functionality' });
    // try {
    //   const allVariables = await Variable.findAll();
    //   res.json(allVariables.map(variable => variable.toJSON()));
    // } catch (err) {
    //   res.status(500).json({ message: 'Error fetching allVariables', error: err });
    // }
});

app.get('/allCanhBaos', async (req, res) => {
    try {
        const allCanhBaos = await CanhBao.findAll();
        res.json(allCanhBaos.map(canhBao => canhBao.toJSON()));
    } catch (err) {
        res.status(500).json({ message: 'Error fetching allCanhBaos', error: err });
    }
});

//  **Chèn hàm fecthAllCanhBaoUpdated() vào đây**
async function fecthAllCanhBaoUpdated(isEmit, req, res) {
    try {
        const allCanhBaoUpdated = await CanhBaoAndLink.findAll({
            include: [
                { model: CanhBao, as: 'canhBao1' },
                { model: CanhBao, as: 'canhBao2' },
                { model: linkSchema },
            ],
            order: [['index', 'ASC']] // Sắp xếp theo index
        });

        if (isEmit) {
            io.emit("receiveAllCanhBaoUpdated", allCanhBaoUpdated.map(item => item.toJSON())); // Gửi dữ liệu đã được serialize
        } else {
            res.json(allCanhBaoUpdated.map(item => item.toJSON())); // Gửi dữ liệu đã được serialize
        }
    } catch (err) {
        if (!isEmit) {
            res.status(500).json({ message: 'Error fetching allCanhBaoUpdated', error: err });
        } else {
            console.error('Error fetching allCanhBaoUpdated (for emit):', err); // Log error for debugging
        }
    }
}

app.get('/allCanhBaoUpdateds', async (req, res) => {
    fecthAllCanhBaoUpdated(false, req, res);
});

function emitCurrentLink() {
    // This function is not directly related to database and could be retained
    // However, it could benefit from the use of data from CanhBaoAndLink
    // For example, if you want to determine the current link based on a certain criteria.
    // Example implementation using the first item in CanhBaoAndLink
    CanhBaoAndLink.findOne({
        include: [{ model: linkSchema }],
        order: [['index', 'ASC']], // Or other criteria
        limit: 1 // get the first one
    })
    .then(firstCanhBaoAndLink => {
        if (firstCanhBaoAndLink && firstCanhBaoAndLink.linkSchema) {
            const link = firstCanhBaoAndLink.linkSchema;
            io.emit("currentLink", link.linkBuy, link.linkSell);
            console.log(`currentLink ${link.linkBuy} ${link.linkSell}`);
        } else {
            console.log('No link found.');
        }
    })
    .catch(err => {
        console.error("Error fetching current link:", err);
    });
}

const users = {};
const com3Url = "https://api.3commas.io/signal_bots/webhooks"
const validCredentials = {
    'cuong': '123'
};

app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/client.html', (req, res) => {
    console.log('Server received request for /index.html');
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/new', async (req, res) => {
    let CanhBaoName = req.query.name;
    let message = req.query.message;
    let index = req.query.index;
    let astro = req.query.astro;

    if (!CanhBaoName) {
        return res.status(400).send({ success: false, message: 'Missing "name" in the query parameters.' });
    }
    if (!message) {
        return res.status(400).send({ success: false, message: 'Missing "message" in the query parameters.' });
    }
    if (!index) {
        return res.status(400).send({ success: false, message: 'Missing "index" in the query parameters.' });
    }
    if (!astro) {
        return res.status(400).send({ success: false, message: 'Missing "astro" in the query parameters.' });
    }

    try {
        const record = await CanhBaoAndLink.findOne({
            where: {
                index: index
            },
            include: [
                { model: CanhBao, as: 'canhBao1' },
                { model: CanhBao, as: 'canhBao2' },
                { model: linkSchema }
            ]
        });

        if (!record) {
            return res.status(404).send({ success: false, message: `CanhBaoAndLink with index ${index} not found` });
        }

        const canhBao1 = record.canhBao1;
        if (!canhBao1) {
            return res.status(404).send({ success: false, message: `canhBao1 not found` });
        }

        if (CanhBaoName === "easy") {
            if (canhBao1.state === "wait") {
                return res.status(404).send({ success: false, message: `wait for trend first` });
            }
            const currentState = canhBao1.state;
            if (currentState === "buy" && message === "buy") {
                sendPayloadTo(req.body, record.linkSchema.linkBuy, astro);
                await canhBao1.update({ state: "wait" });
                await record.reload();
                notifyClient();
                return res.status(200).send({ success: true, message: `lets buy` });
            }
            if (currentState === "sell" && message === "sell") {
                sendPayloadTo(req.body, record.linkSchema.linkSell, astro);
                await canhBao1.update({ state: "wait" });
                await record.reload();
                notifyClient();
                return res.status(200).send({ success: true, message: `lets sell` });
            }
            return;
        } else {
            const timestamp = Date.now();
            await canhBao1.update({ state: message, lastUpdate: timestamp });
            await record.reload();
            notifyClient();
            res.status(200).send({ success: true, message: `CanhBao1 state updated to ${message}` });
        }
    } catch (error) {
        console.error("Error in /new route:", error);
        res.status(500).send({ success: false, message: 'Internal server error', error: error });
    }
});

app.post('/', async (req, res) => {
    let CanhBaoName = req.query.name;
    let message = req.query.message;
    let index = req.query.index;

    if (!CanhBaoName) {
        return res.status(400).send({ success: false, message: 'Missing "name" in the query parameters.' });
    }
    if (!message) {
        return res.status(400).send({ success: false, message: 'Missing "message" in the query parameters.' });
    }
    if (!index) {
        return res.status(400).send({ success: false, message: 'Missing "index" in the query parameters.' });
    }

    try {
        if (CanhBaoName === "easy") {
            const trend = await CanhBao.findOne({ where: { name: "trend" } });
            if (!trend) {
                return res.status(404).send({ success: false, message: `CanhBao with name trend not found` });
            }

            if (trend.state === "wait") {
                return res.status(404).send({ success: false, message: `wait for trend first` });
            }

            if (trend.state === "buy" && message === "buy") {
                await trend.update({ state: "wait" });
                sendPayloadTo("buy", req.body);
                return res.status(200).send({ success: true, message: 'Buy signal processed' });
            }

            if (trend.state === "sell" && message === "sell") {
                await trend.update({ state: "wait" });
                sendPayloadTo("sell", req.body);
                return res.status(200).send({ success: true, message: 'Sell signal processed' });
            }
            return res.status(200).send({ success: true, message: 'No action taken' }); // No action if conditions not met
        } else {
            const timestamp = Date.now();
            const updatedCanhBao = await CanhBao.update(
                { state: message, lastUpdate: timestamp },
                { where: { name: CanhBaoName }, returning: true, plain: true }
            );

            if (updatedCanhBao[0] === 0) {
                return res.status(404).send({ success: false, message: `CanhBao with name '${CanhBaoName}' not found.` });
            }

            notifyClient();
            return res.status(200).send({ success: true, message: `State for ${CanhBaoName} sent successfully and updated` });
        }
    } catch (error) {
        console.error("Error in / route:", error);
        res.status(500).send({ success: false, message: 'Internal server error', error: error });
    }
});

function sendPayloadTo(signal, payload, astro) {
    console.log(`sendPayloadTo ${signal} ${astro}`);
    console.log("send payload ", payload)
    let url = '';
    // Simplified for clarity, determine the correct URL based on the signal
    if (signal === 'buy') {
        url = "https://api-forex.fxastro.pro/api/webhooks/91816814-d267-484a-a110-4f6c25c5c034?privateKeyWebhook=805c81b991d9";  // Example BUY URL
    } else if (signal === 'sell') {
        url = "https://api-forex.fxastro.pro/api/webhooks/91816814-d267-484a-a110-4f6c25c5c034?privateKeyWebhook=805c81b991d9";  // Example SELL URL
    } else if(astro==0){
      url = "https://api-forex.fxastro.pro/api/webhooks/91816814-d267-484a-a110-4f6c25c5c034?privateKeyWebhook=805c81b991d9";
    }
    if (!url) {
        console.warn("No URL defined for signal:", signal);
        return;  // Exit if no URL is available
    }
    //console.log("astro ",astro);
    if (astro==0) {
      const config = {
        headers: {
          'Content-Type': 'text/plain'
        }
      };
      axios.post(url, payload.content, config)
      .then(response => {
        console.log('Status:', response.status);
        console.log('Data:', response.data);
      })
      .catch(error => {
        console.error('Error:', error.response ? error.response.data : error.message);
      });
    }
    else{
    axios.post(url, payload)
        .then(response => {
            console.log('Response from Astro:', response.data);
        })
        .catch(error => {
            console.error('Error sending POST request Astro:', error);
        });
    }
}

app.post('/gtatrend', (req, res) => {
    console.log('/gtatrend Received POST request with the following data:');
    var message = req.body.message;
    console.log("message: ", message);
    currentSignal = message;
    io.emit('currentSignal', currentSignal);
    res.status(200).send({ success: true, message: 'Message sent successfully' });
});

io.on('connection', (socket) => {
    console.log('Client connected', socket.id);
    fecthAllCanhBaoUpdated(true);
    emitCurrentLink();
    socket.on('login', (data) => {
        const { username, password } = data;
        console.log(`Login attempt: username=${username}, password=${password}`);

        if (validCredentials[username] === password) {
            users[socket.id] = username;
            socket.emit('loginSuccess', { message: 'Đăng nhập thành công!' });
            console.log(`User ${username} logged in`);
        } else {
            socket.emit('loginFailed', { message: 'Sai tên đăng nhập hoặc mật khẩu.' });
            console.log(`Login failed for username ${username}`);
        }
    });

    socket.on('disconnect', () => {
        const username = users[socket.id];
        if (username) {
            delete users[socket.id];
            console.log(`User ${username} disconnected`);
        }
        console.log('Client disconnected', socket.id);
    });
    socket.emit('currentNumber', currentNumber);

    socket.on('deleteCanhBaoAndLink', async (id) => {
        try {
          const deleted = await deleteCanhBaotByIdConvenient(id);
            if(deleted) {
              io.emit('deleteCanhBaoAndLinkSuccess', id); // Notify clients
            } else {
              console.log("Failed to delete");
            }
        } catch (error) {
          console.error("Error during delete:", error);
        }
    });

    socket.on('updateNumber', (newNumber) => {
        console.log('Received number:', newNumber);
        currentNumber = newNumber;
        io.emit('currentNumber', currentNumber);
    });

    socket.on('taoCanhBao', async ({ name }) => { // Removed buyMessage and sellMessage
        try {
            await createCanhBao(name);
            console.log("taoCanhBao ok");
        } catch (error) {
            console.error("Lỗi khi tạo cảnh báo:", error);
        }
    });

    socket.on('taoCanhBaoAndLink', async ({ nameCB1, nameCB2, linkBuy, linkSell }) => {
        try {
            await createCanhBaoAndLink(nameCB1, nameCB2, linkBuy, linkSell);
        } catch (error) {
            console.error("Lỗi khi tạo CanhBaoAndLink:", error);
        }
    });
});

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});