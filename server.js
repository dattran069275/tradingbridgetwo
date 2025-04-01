// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Nạp biến môi trường từ file .env
const http = require('http');
const socketIO = require('socket.io');
const axios = require('axios');
// const CanhBao = require('./canhBao'); // Import model
const app = express();
const server = http.createServer(app);
let currentNumber = 60; // Khai báo biến currentNumber ở đây
let currentSignal = "none"; // Khai báo biến currentNumber ở đây
const mongoose = require('mongoose');
const { console } = require('inspector');
// MongoDB client (for replica set)
const MONGODB_URL = process.env.MONGO_PUBLIC_URL;
app.use(cors()); // Enable CORS if needed
app.use(express.json());       // Parses JSON request bodies 
console.log('MongoDB URL:', MONGODB_URL); // In ra để gỡ lỗi

mongoose.connect(MONGODB_URL)  // Xóa các tùy chọn cũ
.then(() => console.log('Đã kết nối đến MongoDB'))
.catch(err => console.error('Lỗi kết nối MongoDB:', err));
const CanhBaoSchema = new mongoose.Schema({
  name: { type: String, required: true },
  state: { type: String,default:"wait"},
  createdAt: { type: Date, default: Date.now },
  lastUpdate: { type: Date, default: Date.now },
});
const VariableSchema = new mongoose.Schema({
  name: { type: String, required: true },
  value: { type: Number, required: true },
});
const linkSchema = new mongoose.Schema({
name: { type: String, default: "superTrend + easy" },
linkBuy : { type: String, required: true },
linkSell : { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  lastUpdate: { type: Date, default: Date.now },
});
// Schema cho CanhBaoAndLink
const CanhBaoAndLinkSchema = new mongoose.Schema({
  canhBao1: { type: CanhBaoSchema, required: true }, // Sử dụng CanhBaoSchema
  canhBao2: { type: CanhBaoSchema, required: true }, // Sử dụng CanhBaoSchema
  link: { type: linkSchema, required: true },         // Sử dụng linkSchema
  index:{type:Number},
  createdAt: { type: Date, default: Date.now },
  lastUpdate: { type: Date, default: Date.now },
});
// Trước khi lưu, tự động tăng index
CanhBaoAndLinkSchema.pre('save', async function(next) {
  if (!this.isNew) {
    // Nếu không phải là record mới (cập nhật), không cần tăng index
    return next();
  }

  try {
    // Tìm record cuối cùng để lấy index lớn nhất hiện tại
    const lastRecord = await this.constructor.findOne({}, {}, { sort: { index: -1 } }); // Sắp xếp theo index giảm dần

    if (lastRecord && lastRecord.index !== undefined && lastRecord.index !== null) {
        this.index = lastRecord.index + 1;
    } else {
        // Nếu không có record nào hoặc index không tồn tại (lần đầu chạy), bắt đầu từ 1
        this.index = 1;
    }

    next();
  } catch (err) {
    return next(err);
  }
});

// Tạo model từ schema
const CanhBao = mongoose.model('CanhBao', CanhBaoSchema);
const Link = mongoose.model('Link', linkSchema);
const Variable = mongoose.model('Variable', VariableSchema);
const CanhBaoAndLink = mongoose.model('CanhBaoAndLink',CanhBaoAndLinkSchema);
// Variable.create({"name":"timeInner","value":120});
const io = socketIO(server, {
  cors: {
      origin: '*', // hoặc chỉ định domain của bạn
      methods: ["GET", "POST"]
  }
});
async function createLink(name,linkBuy, linkSell) {
  console.log(`createLink: [${linkBuy} ${linkSell}]`)
  try {
    const newLink = await Link.create({ name,linkBuy, linkSell}); // Sửa ở đây
      console.log('Đã tạo link:', newLink);
      return newLink;
  } catch (error) {
      console.error('Lỗi khi tạo link:', error);
      return null;
  }
}
async function createCanhBao(name,) {
  console.log(`createCanhBao: [${name}]`) 
  try {
    const newCanhBao = await CanhBao.create({name}); // Sửa ở đây
      console.log('Đã tạo cảnh báo:', newCanhBao);
      io.emit('taoCanhBaoThanhCong', newCanhBao);  // Phát lại giá trị số cho tất cả client
      return newCanhBao;
  } catch (error) {
      console.error('Lỗi khi tạo cảnh báo:', error);
      return null;
  }
}
app.post('/createCanhBaoAndLink', async (req, res) => {
  try {
    const { nameCB1,nameCB2,linkBuy,linkSell } = req.body;
    const newCanhBaoAndLink= await createCanhBaoAndLink(nameCB1,nameCB2,linkBuy,linkSell);
    res.status(201).json(newCanhBaoAndLink);
  } catch (err) {
    res.status(500).json({ message: 'Error adding canh bao', error: err });
  }
});
async function createCanhBaoAndLink(nameCB1,nameCB2,linkBuy,linkSell) {
  console.log(`createCanhBaoAndLink: [${nameCB1} ${nameCB2} ${linkBuy} ${linkSell}]`)
  try {
    const cb1 = await CanhBao.create({ name: nameCB1 }); 
    const cb2 = await CanhBao.create({name: nameCB2 }); 
    const linkName=nameCB1+nameCB2;
    const newLink = await Link.create({ linkName,linkBuy, linkSell});
    const newCanhBaoAndLink = await CanhBaoAndLink.create({canhBao1: cb1, canhBao2:cb2, link:newLink }); // Sửa ở đây
    return newCanhBaoAndLink;
      //console.log('Đã tạo cảnh báo và link:', newCanhBao);
      //io.emit('taoCanhBaoThanhCong', newCanhBao);  // Phát lại giá trị số cho tất cả client
  } catch (error) {
    
      console.error('Lỗi khi tạo cảnh báo:', error);
      return null;
  }
}


async function deleteCanhBaotByIdConvenient(id) {
  try {
      const deletedCanhBao = await CanhBaoAndLink.findByIdAndDelete(id);
      if (deletedCanhBao) {
          console.log(`Đã xóa cảnh báo ID "${id}" (findByIdAndDelete)`);
          return true;
      } else {
          console.log(`Không tìm thấy cảnh báo với ID "${id}" (findByIdAndDelete)`);
          return false;
      }
  } catch (error) {
      console.error('Lỗi khi xóa cảnh báo:', error);
      return false;
  }
}
app.post('/addCanhBao', async (req, res) => {
  try {
    const { name, buyMessage, sellMessage } = req.body;
    console.log("receive post"+ res);
    await createCanhBao(name, buyMessage, sellMessage);
    res.status(201).json(newCanhBao);
  } catch (err) {
    res.status(500).json({ message: 'Error adding canh bao', error: err });
  }
});
app.post('/resetState', async (req, res) => {
  // updateCanhBao("trend","wait")
  // updateCanhBao("easy","wait")
  const {id} = req.body;
  console.log(`resetState ${id}`)
     // Find and update the document using Mongoose
    try{
     const updatedCanhBaoAndLink = await CanhBaoAndLink.findOneAndUpdate(
      { _id: id }, // Tìm bản ghi có _id = id
      {
        $set: {
          'canhBao1.state': "wait",  // Cập nhật 
          'canhBao2.state': "wait", // Cập nhật
          lastUpdate: Date.now()    // Cập nhật thời điểm cập nhật
        },
      },
      { new: true } // Trả về bản ghi đã được cập nhật
    );
    if(!updatedCanhBaoAndLink){
      res.status(404).send({ success: false, message: `update error 404` });
    } 
    else{
      res.status(200).send({ success: true, message: `update  ok` });
      notifyClient()
    }
  }
  catch (error) {
    console.error('Lỗi khi cập nhật CanhBaoAndLink:', error);
    res.status(200).send({ success: true, message: `update error 200` });
  }
}

)
function notifyClient(){
  fecthAllCanhBaoUpdated(true);
}
async function updateCanhBao(canhbaoName,state) {
  CanhBao.findOneAndUpdate(
    { name: canhbaoName }, // Find by the name from the URL
    { state: state},
    { new: true, useFindAndModify: false }
)
.then(updatedCanhBao => {
    if (updatedCanhBao) {
        // res.status(200).send({ success: true, message: `State for ${CanhBaoName} sent successfully and updated` });
        notifyClient();
    
      } else {
        console.log(`CanhBao with name '${CanhBaoName}' not found.`);
        // res.status(404).send({ success: false, message: `CanhBao with name '${CanhBaoName}' not found` });
    }
})
.catch(err => {
    console.error("Error updating CanhBao:", err);
    res.status(500).send({ success: false, message: 'Error updating CanhBao', error: err });
});
}
app.post('/updateLink', async (req, res) => {
  
  const {id, linkBuy, linkSell } = req.body;
  console.log(`updateLink ${id} ${linkBuy} ${linkSell}`)
     // Find and update the document using Mongoose
    try{
     const updatedCanhBaoAndLink = await CanhBaoAndLink.findOneAndUpdate(
      { _id: id }, // Tìm bản ghi có _id = id
      {
        $set: {
          'link.linkBuy': linkBuy,  // Cập nhật linkBuy
          'link.linkSell': linkSell, // Cập nhật linkSell
          lastUpdate: Date.now()    // Cập nhật thời điểm cập nhật
        },
      },
      { new: true } // Trả về bản ghi đã được cập nhật
    );
    if(!updatedCanhBaoAndLink){
      res.status(404).send({ success: false, message: `update error 404` });
    } 
    else{
      res.status(200).send({ success: true, message: `update  ok` });
      notifyClient()
    }
  }
  catch (error) {
    console.error('Lỗi khi cập nhật CanhBaoAndLink:', error);
    res.status(200).send({ success: true, message: `update error 200` });
  }
});
app.get('/allCanhBaoAndLink', async (req, res) => {
  fecthAllCanhbaoAndLinkk(false,req, res);
});
async function fecthAllCanhbaoAndLinkk(isEmit,req, res)
{
  try {
    const allCanhBao = await CanhBaoAndLink.find();
    
    if(isEmit) {
      io.emit("receiveAllCanhBao",allCanhBao)
    }
    else res.json(allCanhBao);
  } catch (err) {
    if(!isEmit) res.status(500).json({ message: 'Error fetching allLink', error: err });
  }
}
app.get('/allLinks', async (req, res) => {
  fecthAllLink(false,req, res);
});
async function fecthAllLink(isEmit,req, res)
{
  try {
    const allCanhBao = await Link.find();
    
    if(isEmit) {
      io.emit("receiveAllCanhBao",allCanhBao)
    }
    else res.json(allCanhBao);
  } catch (err) {
    if(!isEmit) res.status(500).json({ message: 'Error fetching allLink', error: err });
  }
}
app.get('/allVariables', async (req, res) => {
  fecthAllVariables(false,req, res);
});
async function fecthAllVariables(isEmit,req, res)
{
  try {
    const allCanhBao = await Variable.find();
    
    if(isEmit) {
      io.emit("receiveAllCanhBao",allCanhBao)
    }
    else res.json(allCanhBao);
  } catch (err) {
    if(!isEmit) res.status(500).json({ message: 'Error fetching allVariable', error: err });
  }
}
// Route để lấy tất cả students
app.get('/allCanhBaos', async (req, res) => {
  fecthAllCanhBao(false,req, res);
});
app.get('/allCanhBaoUpdateds', async (req, res) => {
  fecthAllCanhBaoUpdated(false,req, res);
});
async function fecthAllCanhBao(isEmit,req, res)
{
  try {
    const allCanhBao = await CanhBao.find();
    
    if(isEmit) {
      io.emit("receiveAllCanhBao",allCanhBao)
      
    }
    else res.json(allCanhBao);
  } catch (err) {
    if(!isEmit) res.status(500).json({ message: 'Error fetching allCanhBao', error: err });
  }
}
async function fecthAllCanhBaoUpdated(isEmit,req, res)
{
  try {
    const allCanhBao = await CanhBaoAndLink.find();
    
    if(isEmit) {
      io.emit("receiveAllCanhBaoUpdated",allCanhBao)  
    }
    else res.json(allCanhBao);
  } catch (err) {
    if(!isEmit) res.status(500).json({ message: 'Error fetching allCanhBao', error: err });
  }
}
function emitCurrentLink(){
  Link.findOneAndUpdate(
    { name: "thefirst" }
  )
.then(updatedCanhBao => {
    if (updatedCanhBao) {
      io.emit("currentLink",updatedCanhBao.linkBuy,updatedCanhBao.linkSell);
      console.log(`currentLink ${updatedCanhBao.linkBuy} ${updatedCanhBao.linkSell}`)
        // res.status(200).send({ success: true, message: `State for thefirst sent successfully and updated` });
    } else {
        console.log(`thefirst not found.`);
        // res.status(404).send({ success: false, message: `thefirst not found` });
    }
})
.catch(err => {
    console.error("Error updating CanhBao:", err);
    res.status(500).send({ success: false, message: 'Error updating CanhBao', error: err });
});
}
async function fecthAllCanhBao(isEmit)
{
  try {
    const allCanhBao = await CanhBao.find();
    
    if(isEmit) {
      io.emit("receiveAllCanhBao",allCanhBao)
    }
  } catch (err) {
  }
}
const users = {};
const com3Url="https://api.3commas.io/signal_bots/webhooks"
const validCredentials = {
  'cuong': '123'
};
app.use(express.static(__dirname)); // <---- Đặt ở đây (trước sự kiện Socket.IO)
app.use(express.json()); // Đảm bảo rằng dữ liệu gửi đến được phân tích cú pháp JSON
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/client.html',  (req, res) => {
    console.log('Server received request for /index.html'); // <---- Thêm log này
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.post('/new',async (req,res)=>{
  let CanhBaoName = req.query.name; // Get the 'name' from the URL's query parameters
  let message = req.query.message;
  let index = req.query.index;
  let astro = req.query.astro;
  if (!CanhBaoName) {
      return res.status(400).send({ success: false, message: 'Missing "name" in the query parameters.  Please use a URL like /?name=your_name' });
  }
  if (!message) {
    return res.status(400).send({ success: false, message: 'Missing "message" in the query parameters.  Please use a URL like /?message=sell/buy' });
}
if (!index) {
  return res.status(400).send({ success: false, message: 'Missing "index" in the query parameters.  Please use a URL like /?index=1/2' });
}
if (!index) {
  return res.status(400).send({ success: false, message: 'Missing "index" in the query parameters.  Please use a URL like /?index=1/2' });
}
if (!astro) {
  return res.status(400).send({ success: false, message: 'Missing "index" in the query parameters.  Please use a URL like /?astro=0/1' });
}
const record = await CanhBaoAndLink.findOne({ index: index });

if (!record) {
    return res.status(404).send({ success: false, message: `CanhBaoAndLink with index ${index} not found` });
}

const canhBao1 = record.canhBao1;
const canhBao2 = record.canhBao2;
if(CanhBaoName=="easy"){
  if(canhBao1.state =="wait") return res.status(404).send({ success: false, message: `wait for trend first` });
    const currentState = canhBao1.state; // Get the current state.
    const now = new Date();
    const diffInMilliseconds = now.getTime() - record.canhBao1.lastUpdate.getTime();
    const diffInSeconds = Math.floor(diffInMilliseconds / 1000); //
    console.log("diffInSeconds: ",diffInSeconds)
    if(currentState=="buy"&&message=="buy") {
      sendPayloadTo(req.body,record.link.linkBuy,astro);
      //reset currentState trend to wait
      record.canhBao1.state = "wait";
      await record.save()
      notifyClient();
      res.status(200).send({ success: true, message: `lets buy` });
      return;
    }
    if(currentState=="sell"&&message=="sell") { 
      sendPayloadTo(req.body,record.link.linkSell,astro);
      record.canhBao1.state = "wait";
      await record.save()
      notifyClient();
      res.status(200).send({ success: true, message: `lets sell` });
      
      return;
    }
    return;
    }
    else {
      const timestamp = Date.now();
        record.canhBao1.state = message;
        record.canhBao1.lastUpdate = timestamp;
        await record.save(); // Save the updated record
        notifyClient();
        res.status(200).send({ success: true, message: `CanhBao1 state updated to ${message}`});
    } 


})

app.post('/', (req, res) => {
  let CanhBaoName = req.query.name; // Get the 'name' from the URL's query parameters
  let message = req.query.message;
  let index = req.query.index;
  if (!CanhBaoName) {
      return res.status(400).send({ success: false, message: 'Missing "name" in the query parameters.  Please use a URL like /?name=your_name' });
  }
  if (!message) {
    return res.status(400).send({ success: false, message: 'Missing "message" in the query parameters.  Please use a URL like /?message=sell/buy' });
}
if (!index) {
  return res.status(400).send({ success: false, message: 'Missing "index" in the query parameters.  Please use a URL like /?index=1/2' });
}


  if(CanhBaoName=="easy"){
    CanhBao.findOne({ name: "trend" })
    .then(trend => {
      if (!trend) {
        return res.status(404).send({ success: false, message: `CanhBao with name trend not found` });
      }
      if(trend.state =="wait") return res.status(404).send({ success: false, message: `wait for trend first` });
      const currentState = trend.state; // Get the current state.
      const now = new Date();
      const diffInMilliseconds = now.getTime() - trend.lastUpdate.getTime();
      const diffInSeconds = Math.floor(diffInMilliseconds / 1000); //
      console.log("diffInSeconds: ",diffInSeconds)
      if(currentState=="buy"&&message=="buy") {
        //reset currentState trend to wait
        trend.state = "wait";
        trend.save()
        sendPayloadTo("buy",req.body);
        return;
      }
      if(currentState=="sell"&&message=="sell") { 
        trend.state = "wait";
        trend.save()
        sendPayloadTo("sell",req.body);
        return;
      }
      return;
      })   
  }
  else {
    console.log(`Received POST request to update ${CanhBaoName} with the following data:`);
  
    const timestamp = Date.now();
    // Find and update the document using Mongoose
    CanhBao.findOneAndUpdate(
        { name: CanhBaoName }, // Find by the name from the URL
        { state: message, lastUpdate:timestamp},
        { new: true, useFindAndModify: false }
    )
    .then(updatedCanhBao => {
        if (updatedCanhBao) {
          notifyClient();
            res.status(200).send({ success: true, message: `State for ${CanhBaoName} sent successfully and updated` });
        } else {
            console.log(`CanhBao with name '${CanhBaoName}' not found.`);
            res.status(404).send({ success: false, message: `CanhBao with name '${CanhBaoName}' not found` });
        }
    })
    .catch(err => {
        console.error("Error updating CanhBao:", err);
        res.status(500).send({ success: false, message: 'Error updating CanhBao', error: err });
    });
  
  } 

  




//   console.log('/easy Received POST request with the following data:');
//   console.log(req.body); // In ra toàn bộ dữ liệu gửi qua POST request


});
function sendPayloadTo(payload,url,astro){
  // Trả lại phản hồi cho client POST request
 // Lấy thời gian hiện tại và gán vào biến timestamp
 // Gửi POST request tới 3Commas
 //var astro="https://api-forex.fxastro.pro/api/webhooks/91816814-d267-484a-a110-4f6c25c5c034?privateKeyWebhook=805c81b991d9"
 //var commas='https://api.3commas.io/signal_bots/webhooks';
 console.log(`sendPayloadTo ${url}`);
 console.log("send payload ",payload)
 if(astro==0){
  const config = {
    headers: {
      'Content-Type': 'text/plain' // Hoặc 'application/x-www-form-urlencoded' nếu cần
    }
  };
  console.log(payload)
  console.log(payload.content)
  axios.post(url, payload.content, config)
  .then(response => {
    console.log('Status:', response.status);
    console.log('Data:', response.data);
  })
  .catch(error => {
    console.error('Error:', error.response ? error.response.data : error.message);
  });
 }
 else {
  axios.post(url, payload)
  .then(response => {
    console.log('Response from Astro:', response.data);
    //res.status(200).send({ success: true, message: payload});
  })
  .catch(error => {
    console.error('Error sending POST request Astro:', error);
    //res.status(200).send({ success: false, message: payload});
  });
 }
  
}
app.post('/gtatrend', (req, res) => {
  console.log('/gtatrend Received POST request with the following data:');
  var message=req.body.message;
  console.log("message: ",message); // In ra toàn bộ dữ liệu gửi qua POST request
  currentSignal=message;
  io.emit('currentSignal', currentSignal);
  CanhBao.findOne()
  // Trả lại phản hồi cho client POST request
  res.status(200).send({ success: true, message: 'Message sent successfully' });
});

io.on('connection', (socket) => {
  console.log('Client connected', socket.id);
  fecthAllCanhBaoUpdated(true);
  //emitCurrentLink();
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
  socket.on('deleteCanhBaoAndLink', (id) =>{
    deleteCanhBaotByIdConvenient(id);
  })
    // Lắng nghe sự kiện nhận số từ client và cập nhật giá trị
    socket.on('updateNumber', (newNumber) => {
        console.log('Received number:', newNumber);
        currentNumber = newNumber;  // Cập nhật giá trị số trên server
        io.emit('currentNumber', currentNumber);  // Phát lại giá trị số cho tất cả client
    });
    socket.on('taoCanhBao', ({ name, buyMessage, sellMessage }) => {
      createCanhBao(name, buyMessage, sellMessage);
  });
  socket.on('taoCanhBaoAndLink',({nameCB1,nameCB2,linkBuy,linkSell})=>{
    createCanhBaoAndLink(nameCB1,nameCB2,linkBuy,linkSell);
  })
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});


