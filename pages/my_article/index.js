// pages/my_article/index.js
import {request} from "../../request/index.js"
import {showToast,getArticleType,getArticleTime} from "../../utils/asyncWx.js"
Page({

  /**
   * 页面的初始数据
   */
  data: {
    myArticleList: []
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    const {type}=options
    if(type=="write"){
      wx.setNavigationBarTitle({
        title: '我写的博文',
      });
    }else if(type=="collect"){
      wx.setNavigationBarTitle({
        title: '我收藏的博文',
      });
    }
    this.getArticleList(type)
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    // let pages=getCurrentPages()
    // let currentPage=pages[pages.length-1]
    // let options=currentPage.options
    
  },
  async getArticleList(type){
    if(type=='write'){
      const res=await request({
        url:'/my/article/write',
        method:'GET'
      })
      this.setData({
        myArticleList: res
      })
    }else if(type=='collect'){
      const res=await request({
        url:'/my/article/collect',
        method:'GET'
      })
      this.setData({
        myArticleList: res
      })
    }
  },
  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  }
})