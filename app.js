const express = require('express')
const app = express()
const fs = require('fs')
const path = require('path')
const mysql = require('mysql')
const jwt = require('jsonwebtoken')
const compression = require('compression')

const https = require('https')
const http = require('http')
const APPID= 'wx329693e295427044'
const SECRET = 'da51dd9ab1e4a832a0299590d5be7e6d'
const connectionPool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password : 'SU20000922',
  database : 'wx-blog'
});

const bodyParser = require('body-parser')
// let options = {
//   cert: fs.readFileSync('../www.fileaccent.cn/Apache/2_www.fileaccent.cn.crt'),
//   key: fs.readFileSync('../www.fileaccent.cn/Apache/3_www.fileaccent.cn.key')
// }
const privateKey = fs.readFileSync(path.join(__dirname, './certificate/private.pem'), 'utf8'); 
const certificate = fs.readFileSync(path.join(__dirname, './certificate/file.crt'), 'utf8'); 
const options = {
  key:privateKey,
  cert:certificate
}
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const httpServer = http.createServer(app);
const httpsServer = https.createServer(options, app)

httpServer.listen(8081, function() {
  console.log('HTTP Server is running');
});
httpsServer.listen(8080, function() {
  console.log('HTTPS Server is running');
});

app.use(compression())
app.use('/article_img',express.static('article_img'))
app.use('/cover_img',express.static('cover_img'))
app.use(bodyParser.json({limit : '2100000kb'}))  
app.use(bodyParser.urlencoded({ extended: false }))
app.all('*', function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
  res.header("Access-Control-Allow-Headers", ['X-Requested-With','Content-Type','Authorization']);
  res.header('Access-Control-Allow-Credentials', true);
  next();
})
//生成唯一识别码
function getUuid() {
	var s = [];
	var hexDigits = "0123456789abcdef";
	for (var i = 0; i < 36; i++) {
		s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
	}
	s[14] = "4"; // bits 12-15 of the time_hi_and_version field to 0010
	s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1); // bits 6-7 of the clock_seq_hi_and_reserved to 01
	s[8] = s[13] = s[18] = s[23] = "-";

	var uuid = s.join("");
	return uuid;
}
//封装Promise
//封装https请求
const httpsRequest = (url)=>{
  return new Promise((resolve,reject)=>{
    https.get(url,(res)=>{
      res.on('data',(d)=>{
        resolve(JSON.parse(d.toString()))
      })
    }).on('error',(e)=>{
      reject(e)
    })
  })
}
//封装文件写
const fileWrite = (path,buffer) => {
  return new Promise((resolve,reject) => {
    fs.writeFile(path,buffer,(err)=>{
      if(err){
        reject(err)
      }
    })
    resolve()
  })
}
//封装token验证
const tokenTest = (token, secret) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, (err, decode) => {
      if (err) {
        reject(err)
      } else {
        resolve(decode)
      }
    })
  })
}
//读取文件
let fileRead = (path) => {
  return new Promise((resolve, reject) => {
    fs.readFile(path,(err,data) => {
      if (err) {
        reject('读取文件失败')
      }else {
        resolve(data)
      }
    })
  })
}
//数据库操作封装
const getConnection = function() {
  // 返回一个 Promise
  return new Promise(( resolve,reject ) => {
    connectionPool.getConnection(function(err, connection) {
      if (err) {
        reject('连接数据库连接池失败')
      } else {
        resolve(connection)
      }
    })
  })
}
const beginTransaction = (conn)=>{
  return new Promise((resolve,reject)=>{
    conn.beginTransaction((err)=>{
      if(err){
        reject('开启事务失败')
      }
      resolve()
    })
  })
}
const query = function (conn,sql,values ){
  return new Promise((resolve,reject)=>{
    conn.query(sql, values, ( err, rows) => {
      if ( err ) {
        console.log(err);
        reject('执行sql失败')
      } else {
        resolve( rows )
      }
      // 结束会话
    })
  })
}
const commit = (conn) => {
  return new Promise((resolve,reject)=>{
    conn.commit(err=>{
      if(err){
        conn.rollback()
        reject('事务提交失败')
      }
      resolve()
    })
  })
}

//用户登录或注册
app.post('/user',async (req,res) => {
  try{
    let userId = 0;
    var conn = await getConnection()
    const {openid,session_key}=await httpsRequest('https://api.weixin.qq.com/sns/jscode2session?appid='+APPID+'&secret='+SECRET+'&js_code='+req.body.code+'&grant_type=authorization_code')
    let selectSql = 'SELECT id,nickName,gender,avatarUrl,collectArticle,writeArticle,careAuthor FROM user WHERE openId = ?'
    let rows = await query(conn,selectSql,openid)
    if(!rows.length){
      await beginTransaction(conn)
      let sql = 'INSERT INTO user(nickName,gender,avatarUrl,openId) VALUES(?,?,?,?)'
      let sqlParam = [req.body.nickName,req.body.gender,req.body.avatarUrl,openid]
      let rows2 = await query(conn,sql,sqlParam)
      userId = rows2.insertId
      let payload = {id:userId,session_key:session_key,username:req.body.nickName}
      let token = jwt.sign(payload,SECRET)
      await commit(conn)
      res.json({token:token,collectArticle:0,writeArticle:0,careAuthor:0})
    }else {
      console.log(rows);
      userId = rows[0].id
      let payload = {id:userId,session_key:session_key}
      let token = jwt.sign(payload,SECRET)
      res.json({token:token,collectArticle:rows[0].collectArticle,writeArticle:rows[0].writeArticle,careAuthor:rows[0].careAuthor})
    }
  }catch(err){
    console.log(err)
    if(conn){
      conn.rollback()
    }
    res.status(404)
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//上传博文中图片
app.post('/my/article/image',async (req,res)=>{
  try {
    let uuid = getUuid()
    let imgUrl = 'https://localhost:8080/article_img/'+uuid+'.jpg'
    //console.log(req.body.image);
    let imgBuffer = Buffer.from(req.body.image,'base64')
    await fileWrite('./article_img/'+uuid+'.jpg',imgBuffer)
    return res.json({imgUrl:imgUrl})
  }catch(err){
    console.log(err)
    res.status(500)
  }
})
//上传博文
app.post('/my/article',async (req,res)=>{
  try{
    var conn = await getConnection()
    let tokenResult = await tokenTest(req.headers.authorization,SECRET)
    console.log(tokenResult);
    await beginTransaction(conn)
    let sql='INSERT INTO article(title,type,authorId,time) VALUES(?,?,?,?)'
    let sqlParam=[req.body.title,req.body.type,tokenResult.id,req.body.time]
    let rows=await query(conn,sql,sqlParam)
    let id=rows.insertId
    let imgBuffer=Buffer.from(req.body.imageSrc,'base64')
    await fileWrite('./cover_img/'+id+'.jpg',imgBuffer)
    await fileWrite('./article/'+id+'.html',req.body.content)
    let sql2='UPDATE user SET writeArticle = writeArticle + 1 WHERE id = ?'
    await query(conn,sql2,tokenResult.id)
    await commit(conn)
    res.end()
  }catch(err){
    console.log(err);
    if(conn){
      conn.rollback()
    }
    res.status(500)
    res.end()
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//获取最热博文
app.get('/article/rank',async (req,res)=>{
  try{
    var conn = await getConnection()
    let sql="SELECT article.id,article.title,article.type,user.nickName as author,article.commentNum,article.likeNum,article.collectNum, article.commentNum+article.likeNum+article.collectNum as sum FROM article left join user on user.id = article.authorId ORDER BY sum DESC LIMIT 10"
    let rows=await query(conn,sql)
    rows=rows.map((v)=>{
      v.image='https://localhost:8080/cover_img/'+v.id+'.jpg'
      return v
    })
    return res.json(rows)
  }catch(err){
    console.log(err);
    res.status(500)
    res.end()
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//获取最新博文
app.get('/article/page',async (req,res)=>{
  try{
    var conn = await getConnection()
    if(req.query.pageParam==-1){
      let sql="SELECT article.id,article.title,article.type,user.nickName as author,article.commentNum,article.likeNum,article.collectNum FROM article left join user on user.id = article.authorId ORDER BY article.id DESC LIMIT 10"
      let rows=await query(conn,sql)
      if(rows.length){
        rows=rows.map((v)=>{
          v.image='https://localhost:8080/cover_img/'+v.id+'.jpg'
          return v
        })
        return res.json({articleList:rows,pageParam:rows[0].id-rows.length+1})
      }else {
        return res.json({articleList:rows,pageParam:-1})
      }
    }
    else{
      let sql="SELECT article.id,article.title,article.type,user.nickName as author,article.commentNum,article.likeNum,article.collectNum FROM article left join user on user.id = article.authorId WHERE article.id < ? LIMIT 10"
      let sqlParam=[req.query.pageParam]
      let rows=await query(conn,sql,sqlParam)
      if(rows.length){
        rows=rows.map((v)=>{
          v.image='https://localhost:8080/cover_img/'+v.id+'.jpg'
          return v
        })
        return res.json({articleList:rows,pageParam:rows[0].id-rows.length+1})
      }else {
        return res.json({articleList:rows,pageParam:-1})
      }
    }
  }catch(err){
    console.log(err);
    res.status(500)
    res.end()
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//获取某种类型博文列表
app.get('/article/type',async (req,res)=>{
  try{
    var conn = await getConnection()
    if(req.query.pageParam==-1){
      let sql="SELECT article.id,article.authorId,article.title,article.commentNum,article.likeNum,article.collectNum,user.nickName as author FROM article left join user on article.authorId = user.id WHERE article.type = ? ORDER BY article.id DESC LIMIT 10"
      let sqlParam=[req.query.type]
      let rows=await query(conn,sql,sqlParam)
      if(!rows.length){
        return res.json({articleList:[],pageParam:-1})
      }
      rows=rows.map((v)=>{
        v.image='https://localhost:8080/cover_img/'+v.id+'.jpg'
        return v
      })
      return res.json({articleList:rows,pageParam:rows[0].id-rows.length+1})
    }
    else{
      let sql="SELECT article.id,article.authorId,article.title,article.commentNum,article.likeNum,article.collectNum,user.nickName as author FROM article left join user on article.authorId = user.id WHERE article.type = ? AND article.id < ? LIMIT 10"
      let sqlParam=[req.body.type,req.query.pageParam]
      let rows=await query(conn,sql,sqlParam)
      if(!rows.length){
        return res.json({articleList:[],pageParam:-1})
      }
      return res.json({articleList:rows,pageParam:rows[0].id-rows.length+1})
    }
  }catch(err){
    console.log(err);
    res.status(500)
    res.end()
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//获取博文详情
app.get('/article/detail',async (req,res)=>{
  try{
    var conn = await getConnection()
    if(req.headers.authorization){
      let tokenResult = await tokenTest(req.headers.authorization,SECRET)
      let sql="SELECT article.id,article.authorId,article.title,article.time,article.commentNum,article.collectNum,article.type,article.likeNum,IFNULL(articlehandle.isLike,0) as isLike,IFNULL(articlehandle.isCollect,0) as isCollect,user.avatarUrl,user.nickName as author,IFNULL(care.isCare,0) as isCare FROM article left join user on article.authorId = user.id left join articlehandle on articlehandle.readerId=? and articlehandle.articleId=? left join care on article.authorId=care.authorId and care.readerId=? WHERE article.id = ?"
      let rows=await query(conn,sql,[tokenResult.id,req.query.id,tokenResult.id,req.query.id])
      let textData = await fileRead('./article/'+rows[0].id+'.html')
      rows[0].content = textData.toString('utf-8')
      return res.json(rows[0])
    }else {
      let sql="SELECT article.id,article.authorId,article.title,article.time,article.commentNum,article.collectNum,article.type,user.nickName as author,article.likeNum,user.avatarUrl FROM article left join user on article.authorId = user.id WHERE article.id=?"
      console.log(req.query.id);
      let rows=await query(conn,sql,req.query.id)
      console.log(rows);
      let textData = await fileRead('./article/'+rows[0].id+'.html')
      rows[0].content = textData.toString('utf-8')
      return res.json(rows[0])
    }
  }catch(err){
    console.log(err);
    res.status(500)
    res.end()
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//博文收藏
app.put('/article/:id/collect',async (req,res)=>{
  try {
    var conn = await getConnection()
    let tokenResult = await tokenTest(req.headers.authorization,SECRET)
    let selectSql = 'SELECT authorId FROM article WHERE id = ?'
    let select_row = await query(conn,selectSql,req.params.id)
    if(select_row[0].authorId==tokenResult.id){
      res.status(403)
      return res.json({message:'不能收藏自己写的博文哦'})
    }
    let sql1 = 'SELECT * FROM articlehandle WHERE readerId = ? AND articleId = ?'
    let rows1 = await query(conn,sql1,[tokenResult.id,req.params.id])
    await beginTransaction(conn)
    if(!rows1.length){
      let sql2 = 'INSERT INTO articlehandle(articleId,readerId,isCollect,isLike) VALUES(?,?,?,?)'
      await query(conn,sql2,[req.params.id,tokenResult.id,1,0])
      let sql3 = 'UPDATE article SET collectNum = collectNum + 1 WHERE id = ?'
      await query(conn,sql3,req.params.id)
      let sql4 = 'UPDATE user SET collectArticle = collectArticle + 1 WHERE id = ?'
      await query(conn,sql4,tokenResult.id)
    }else {
      let sql2 = 'UPDATE articlehandle SET isCollect = ? WHERE readerId = ? AND articleId = ?'
      await query(conn,sql2,[req.body.isCollect,tokenResult.id,req.params.id])
      if(req.body.isCollect){
        let sql3 = 'UPDATE article SET collectNum = collectNum + 1 WHERE id = ?'
        await query(conn,sql3,req.params.id)
        let sql4 = 'UPDATE user SET collectArticle = collectArticle + 1 WHERE id = ?'
        await query(conn,sql4,tokenResult.id)
      }else {
        let sql3 = 'UPDATE article SET collectNum = collectNum - 1 WHERE id = ?'
        await query(conn,sql3,req.params.id)
        let sql4 = 'UPDATE user SET collectArticle = collectArticle - 1 WHERE id = ?'
        await query(conn,sql4,tokenResult.id)
      }
    }
    await commit(conn)
    res.json({message:'ok'})
  }catch(err){
    console.log(err);
    res.status(500);
    if(conn){
      conn.rollback()
    }
    res.end()
  }finally{
    if(conn){
      conn.release()
    }
  }
})
//博文点赞
app.put('/article/:id/like',async (req,res)=>{
  try {
    var conn = await getConnection()
    let tokenResult = await tokenTest(req.headers.authorization,SECRET)
    let selectSql = 'SELECT authorId FROM article WHERE id = ?'
    let select_row = await query(conn,selectSql,req.params.id)
    if(select_row[0].authorId==tokenResult.id){
      res.status(403)
      return res.json({message:'不能点赞自己写的博文哦'})
    }
    let sql1 = 'SELECT * FROM articlehandle WHERE readerId = ? AND articleId = ?'
    let rows1 = await query(conn,sql1,[tokenResult.id,req.params.id])
    await beginTransaction(conn)
    if(!rows1.length){
      let sql2 = 'INSERT INTO articlehandle(articleId,readerId,isCollect,isLike) VALUES(?,?,?,?)'
      await query(conn,sql2,[req.params.id,tokenResult.id,0,1])
      let sql3 = 'UPDATE article SET likeNum = likeNum + 1 WHERE id = ?'
      await query(conn,sql3,req.params.id)
    }else {
      let sql2 = 'UPDATE articlehandle SET isLike = ? WHERE readerId = ? AND articleId = ?'
      await query(conn,sql2,[req.body.isLike,tokenResult.id,req.params.id])
      if(req.body.isLike){
        let sql3 = 'UPDATE article SET likeNum = likeNum + 1 WHERE id = ?'
        await query(conn,sql3,req.params.id)
      }else {
        let sql3 = 'UPDATE article SET likeNum = likeNum - 1 WHERE id = ?'
        await query(conn,sql3,req.params.id)
      }
    }
    await commit(conn)
    res.json({message:'ok'})
  }catch(err){
    console.log(err);
    res.status(500)
    if(conn){
      conn.rollback()
    }
    res.end()
  }finally{
    if(conn){
      conn.release()
    }
  }
})
//博主关注
app.put('/author/:id/care',async (req,res)=>{
  try {
    var conn = await getConnection()
    let tokenResult = await tokenTest(req.headers.authorization,SECRET)
    // let selectSql = 'SELECT userId FROM user WHERE id = ?'
    // let select_row = await query(conn,selectSql,req.params.id)
    // let authorId = select_row[0].userId
    if(req.params.id==tokenResult.id){
      res.status(403)
      return res.json({message:'不能关注自己哦'})
    }
    let sql1 = 'SELECT * FROM care WHERE readerId = ? AND authorId = ?'
    let rows1 = await query(conn,sql1,[tokenResult.id,req.params.id])
    await beginTransaction(conn)
    if(!rows1.length){
      let sql2 = 'INSERT INTO care(authorId,readerId,isCare) VALUES(?,?,?)'
      await query(conn,sql2,[req.params.id,tokenResult.id,1])
      let sql3 = 'UPDATE user SET careAuthor = careAuthor + 1 WHERE id = ?'
      await query(conn,sql3,tokenResult.id)
    }else {
      let sql2 = 'UPDATE care SET isCare = ? WHERE readerId = ? AND authorId = ?'
      await query(conn,sql2,[req.body.isCare,tokenResult.id,req.params.id])
      if(req.body.isCare){
        let sql3 = 'UPDATE user SET careAuthor = careAuthor + 1 WHERE id = ?'
        await query(conn,sql3,tokenResult.id)
      } else {
        let sql3 = 'UPDATE user SET careAuthor = careAuthor - 1 WHERE id = ?'
        await query(conn,sql3,tokenResult.id)
      }
    }
    await commit(conn)
    res.json({message:'ok'})
  }catch(err){
    console.log(err);
    res.status(500)
    if(conn){
      conn.rollback()
    }
    res.end()
  }finally{
    if(conn){
      conn.release()
    }
  }
})
//获取评论
app.get('/article/:id/comment', async (req, res) => {
  try {
    var conn = await getConnection()
    let sql_1 = 'SELECT comment.id,comment.content,comment.time,comment.commenterId,user.nickName,user.avatarUrl FROM comment left join user on comment.commenterId = user.id  WHERE comment.articleId = ?'
    let rows_1 = await query(conn,sql_1,req.params.id)
    for(let j=0;j<rows_1.length;j++) {
      let selectSql = 'SELECT reply.id,reply.commentId,reply.reviewerId as commenterId,reply.time,reply.content,reviewer.nickName as reviewer,responder.nickName as responder FROM reply left join user as reviewer on reviewer.id = reply.reviewerId left join user as responder on responder.id = reply.responderId WHERE reply.commentId = ?' 
      let rows_2 = await query(conn,selectSql,rows_1[j].id)
      if(!rows_2) break
      rows_1[j].apply=rows_2
    }
    res.json(rows_1)
  } catch (err) {
    console.log(err)
    res.status(500)
    res.end()
  } finally {
    if(conn){
      conn.release()
    }
  }
})
//增加评论
app.post('/comment/add', async (req, res) => {
  try {
    var conn = await getConnection()
    let tokenResult = await tokenTest(req.headers.authorization,SECRET)
    await beginTransaction(conn)
    let sql_1 = 'INSERT INTO comment(articleId,commenterId,time,content) VALUES(?,?,?,?)'
    let rows_1 = await query(conn,sql_1,[req.body.articleId,tokenResult.id,req.body.time,req.body.content])
    console.log(rows_1);
    let sql_2 = 'SELECT nickName,avatarUrl From user WHERE id = ?'
    let rows_2 = await query(conn,sql_2,tokenResult.id)
    let sql_3 = 'UPDATE article SET commentNum = commentNum + 1 WHERE id = ?'
    await query(conn,sql_3,req.body.articleId)
    await commit(conn)
    rows_2[0].commenterId = tokenResult.id
    res.json(rows_2[0])
  } catch (err) {
    console.log(err)
    res.status(err)
    if(conn){
      conn.rollback()
    }
    res.end()
  } finally{
    if(conn){
      conn.release()
    }
  }
})
//回复评论
app.post('/comment/reply', async (req, res) => {
  try {
    var conn = await getConnection()
    let tokenResult = await tokenTest(req.headers.authorization,SECRET)
    await beginTransaction(conn)
    let sql_1 = 'INSERT INTO reply(commentId,reviewerId,responderId,time,content) VALUES(?,?,?,?,?)'
    let rows_1 = await query(conn,sql_1,[req.body.commentId,req.body.commenterId,tokenResult.id,req.body.time,req.body.content])
    console.log(rows_1);
    let sql_2 = 'SELECT nickName,avatarUrl From user WHERE id = ?'
    let rows_2 = await query(conn,sql_2,tokenResult.id)
    let sql_3 = 'UPDATE article SET commentNum = commentNum + 1 WHERE id = ?'
    await query(conn,sql_3,req.body.articleId)
    await commit(conn)
    rows_2[0].commenterId = tokenResult.id
    res.json(rows_2[0])
  } catch (err) {
    console.log(err)
    if(conn) {
      conn.rollback()
    }
    res.status(err)
    res.end()
  } finally{
    if(conn){
      conn.release()
    }
  }
})
//获取我写的博文
app.get('/my/article/write', async (req, res) => {
  try {
    var conn = await getConnection()
    let tokenResult = await tokenTest(req.headers.authorization,SECRET)
    let sql = 'SELECT article.id,article.title,article.commentNum,article.likeNum,article.collectNum,user.nickName as author FROM article left join user on user.id = article.authorId WHERE authorId = ?'
    let rows = await query(conn,sql,tokenResult.id)
    rows=rows.map((v)=>{
      v.image='https://localhost:8080/cover_img/'+v.id+'.jpg'
      return v
    })
    res.json(rows)
  } catch (err) {
    console.log(err)
    res.status(500)
    res.end()
  } finally {
    if(conn){
      conn.release()
    }
  }
})
//获取我收藏的博文
app.get('/my/article/collect', async (req, res) => {
  try {
    var conn = await getConnection()
    let tokenResult = await tokenTest(req.headers.authorization,SECRET)
    let sql = 'SELECT article.id,user.nickName as author,article.title,article.commentNum,article.likeNum,article.collectNum FROM article left join articlehandle on articlehandle.articleId = article.id left join user on user.id = article.authorId WHERE articlehandle.readerId = ? AND articlehandle.isCollect = 1'
    let rows = await query(conn,sql,tokenResult.id)
    rows=rows.map((v)=>{
      v.image='https://localhost:8080/cover_img/'+v.id+'.jpg'
      return v
    })
    res.json(rows)
  } catch (err) {
    console.log(err)
    res.status(500)
    res.end()
  } finally {
    if(conn){
      conn.release()
    }
  }
})
//获取我关注的博主
app.get('/my/author/care', async (req, res) => {
  try {
    var conn = await getConnection()
    let tokenResult = await tokenTest(req.headers.authorization,SECRET)
    let sql = 'SELECT user.nickName,user.gender,user.avatarUrl,user.id,user.school,user.major FROM user left join care on care.authorId = user.id WHERE care.readerId = ? AND care.isCare = 1'
    let rows = await query(conn,sql,tokenResult.id)
    res.json(rows)
  } catch (err) {
    console.log(err)
    res.status(500)
    res.end()
  } finally {
    if(conn){
      conn.release()
    }
  }
})
//获取其他博主信息
app.get('/author/:id/detail', async (req, res) => {
  console.log(req.headers);
  try {
    var conn = await getConnection()
    if(req.headers.authorization){
      let tokenResult = await tokenTest(req.headers.authorization,SECRET)
      // let selectSql = 'SELECT userId FROM user WHERE id = ?'
      // let selectRow = await query(conn,selectSql,req.params.id)
      if(tokenResult.id==req.params.id){
        let sql = 'SELECT nickName,gender,avatarUrl,id,school,major FROM user WHERE id = ?'
        let rows = await query(conn,sql,[tokenResult.id])
        res.json(rows[0])
      }else {
        let sql = 'SELECT user.nickName,user.gender,user.avatarUrl,user.id,user.school,user.major,IFNULL(care.isCare,0) as isCare FROM user left join care on care.authorId = user.id AND care.readerId = ? WHERE user.id = ?'
        let rows = await query(conn,sql,[tokenResult.id,req.params.id])
        res.json(rows[0])
      }
    } else 
    {
      // let selectSql = 'SELECT userId FROM user WHERE id = ?'
      // let selectRow = await query(conn,selectSql,req.params.id)
      let sql = 'SELECT nickName,gender,avatarUrl,id,school,major FROM user WHERE id = ?'
      let rows = await query(conn,sql,req.params.id)
      rows[0].isCare = 0
      res.json(rows[0])
    }
  } catch (err) {
    console.log(err)
    res.status(500)
    res.end()
  } finally {
    if(conn){
      conn.release()
    }
  }
})
app.get('/author/:id/article/collect', async (req, res) => {
  try {
    var conn = await getConnection()
    // let selectSql = 'SELECT userId FROM user WHERE id = ?'
    // let selectRow = await query(conn,selectSql,req.params.id)
    let sql = 'SELECT article.id,article.title,article.authorId,article.commentNum,article.likeNum,article.collectNum,user.nickName as author FROM article left join articlehandle on articlehandle.articleId = article.id left join user on user.id = article.authorId WHERE articlehandle.readerId = ? AND articlehandle.isCollect = 1'
    let rows = await query(conn,sql,req.params.id)
    rows=rows.map((v)=>{
      v.image='https://localhost:8080/cover_img/'+v.id+'.jpg'
      return v
    })
    res.json(rows)
  } catch (err) {
    console.log(err)
    res.status(500)
    res.end()
  } finally {
    if(conn){
      conn.release()
    }
  }
})
app.get('/author/:id/article/write', async (req, res) => {
  try {
    var conn = await getConnection()
    // let selectSql = 'SELECT userId FROM user WHERE id = ?'
    // let selectRow = await query(conn,selectSql,req.params.id)
    let sql = 'SELECT article.id,article.title,article.authorId,article.commentNum,article.likeNum,article.collectNum,user.nickName as author FROM article left join user on user.id = article.authorId WHERE authorId = ?'
    let rows = await query(conn,sql,req.params.id)
    rows=rows.map((v)=>{
      v.image='https://localhost:8080/cover_img/'+v.id+'.jpg'
      return v
    })
    res.json(rows)
  } catch (err) {
    console.log(err)
    res.status(500)
    res.end()
  } finally {
    if(conn){
      conn.release()
    }
  }
})
//获取用户信息
app.get('/user', async (req, res) => {
  try {
    var conn = await getConnection()
    let tokenResult = await tokenTest(req.headers.authorization,SECRET)
    let sql = 'SELECT gender,id,nickName,avatarUrl,school,major,writeArticle,collectArticle,careAuthor FROM user WHERE id = ?'
    let rows = await query(conn,sql,tokenResult.id)
    res.json(rows[0])
  } catch (err) {
    console.log(err)
    res.status(500)
    res.end()
  } finally {
    if(conn){
      conn.release()
    }
  }
})
//修改用户信息
app.put('/user', async (req, res) => {
  try {
    var conn = await getConnection()
    let tokenResult = await tokenTest(req.headers.authorization,SECRET)
    await beginTransaction(conn)
    let sql = 'UPDATE user SET nickName = ?, gender = ?, school = ?,major = ? WHERE id = ? '
    let rows = await query(conn,sql,[req.body.nickName,req.body.gender,req.body.school,req.body.major,tokenResult.id])
    await commit(conn)
    res.json({message:'ok'})
  } catch (err) {
    console.log(err)
    if(conn){
      conn.rollback()
    }
    res.status(500)
    res.end()
  } finally {
    if(conn){
      conn.release()
    }
  }
})
//获取搜索结果
app.get('/article/search', async (req, res) => {
  try {
    console.log(req.query);
    var conn = await getConnection()
    let sql = "SELECT article.id,article.title,user.nickName as author FROM article left join user on user.id = article.authorId WHERE article.title LIKE ? or user.nickName LIKE ?"
    let rows = await query(conn,sql,['%'+req.query.query+'%','%'+req.query.query+'%'])
    await commit(conn)
    res.json(rows)
  } catch (err) {
    console.log(err)
    if(conn){
      conn.rollback()
    }
    res.status(500)
    res.end()
  } finally {
    if(conn){
      conn.release()
    }
  }
})