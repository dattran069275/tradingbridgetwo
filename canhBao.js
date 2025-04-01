const mongoose = require('mongoose');
// Kết nối MongoDB
console.log("Mongo URL:", process.env.MONGO_URL);
mongoose.connect(process.env.MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('Error connecting to MongoDB:', err));
// Định nghĩa schema cho CanhBao
const CanhBaoData = new mongoose.Schema({
  name: { type: String, required: true },
  BuyMessage: { type: String, required: true },
  sellMessage: { type: String, required: true },
});
// Tạo model từ schema
const CanhBao = mongoose.model('CanhBao', CanhBaoData);

module.exports = CanhBao;