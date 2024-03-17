const express = require('express')

const PORT = 3000;
const app = express()

const multer = require('multer')
const AWS = require('aws-sdk')
require('dotenv').config();
const path = require('path')
const { error } = require('console')



// Cấu hình multer để lưu trữ file trong bộ nhớ
const storage = multer.memoryStorage();

// Thiết lập multer
const upload = multer({
    storage: storage,
    limits: { fileSize: 2000000 }, // Giới hạn dung lượng file là 2MB
    fileFilter: function(req, file, cb) {
      checkFileType(file, cb);
    }
  });
module.exports = upload;


// Cấu hình App
app.use(express.static("./views"))
app.set('view engine ', 'ejs');
app.use(express.json({extended: false}))
app.set('views' , './views');

// Cấu hình AWS
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = "1"
AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
});
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient(); 
const bucketName = process.env.S3_BUCKET_NAME;
const tableName = process.env.DYNAMODB_TABLE_NAME;

// Hàm kiểm tra kiểu file
function checkFileType(file, cb) {
    const fileTypes = /jpeg|jpg|png|gif/;
    // Kiểm tra phần mở rộng và kiểu mime của file
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb('Error: Pls upload images /jpeg|jpg|png|gif/ only!');
    }
  }
// Routers
app.get('/', async (req, res) => {
    try {
      const params = { TableName: tableName }; // Thiết lập tên bảng DynamoDB
      const data = await dynamodb.scan(params).promise();
      return res.render("index.ejs", { data: data.Items }); // Render trang index và truyền dữ liệu
    } catch (error) {
      console.error("Error retrieving data from DynamoDB:", error);
      return res.status(500).send('Internal Server Error');
    }
  });
  
  app.post("/save", upload.single('image'), async (req, res) => {
    // Middleware upload.single("image") đảm bảo chỉnh định rằng field có name là "image" được upload
    // Xử lý việc lưu trữ dữ liệu vào DynamoDB sau khi upload file
    try{
        const maSanPham = req.body.maSanPham;
        const tenSanPham = req.body.tenSanPham;
        const soLuong = Number(req.body.soLuong);

        const existingRecord = await dynamodb.get({
            TableName: tableName,
            Key: {
                maSanPham: maSanPham
            }
        }).promise();

        if (existingRecord.Item) {
            return res.status(400).send('Mã san pham đã tồn tại.');
        }

        const image = req.file?.originalname.split(".");
        const fileType = image[image.length - 1];
        const filePath = `${maSanPham}_${Date.now().toString()}.${fileType}`

        const paramsS3 = {
            Bucket : bucketName,
            Key: filePath,
            Body: req.file.buffer,
            ContenType: req.file.mimetype,
        };

        s3.upload(paramsS3, async (err, data) =>{
            if(err){
                console.error("error!", err);
                return res.send("Internal server error!");
            }else{
                const imageURL = data.Location;
                console.log('imageURL= ', imageURL)
                const paramsDynamoDB = {
                    TableName: tableName,
                    Item:{
                        maSanPham: maSanPham,
                        tenSanPham: tenSanPham,
                        soLuong: Number(soLuong),
                        image: imageURL,
                    },
                };
                await dynamodb.put(paramsDynamoDB).promise();
                return res.redirect("/"); //Goi render lai trang index
            }
            
        });
    }catch(error){
        console.error("Error saving data from DynamoDB:", error);
        return res.status(500).send("Internal Server Error");
    }
  });
  
  app.post('/delete', upload.fields([]), (req, res) =>{
   
    // console.log('Deleting...');
    const listCheckBoxSelected = Object.keys(req.body);

    if(!listCheckBoxSelected || listCheckBoxSelected.length <= 0){
        return res.redirect('/')
    }
    try{
        function onDeleteItem(length){ // Dinh nghia de quy xoa
            const params = {
                TableName: tableName,
                Key: {
                    "maSanPham" : listCheckBoxSelected[length]
                }
            }
            dynamodb.delete(params,(err,data)=>{
                if(err){
                    console.error("error", err);
                    return res.send("Interal Server Error!");
                }else
                    if(length > 0)
                        onDeleteItem(length - 1)
                    else
                        return res.redirect('/')
            });
        }
            onDeleteItem(listCheckBoxSelected.length - 1); // Goi ham de quy xoa
    }catch (error){
        console.error("Error deleting data from DynamoDB: ", error);
        return res.status(500).send("Internal Server Error");
    }
    
});




app.listen(3000, () =>{
    console.log("Running in port 3000..")
})

