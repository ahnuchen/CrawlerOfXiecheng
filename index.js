/**
 * 作者 陈长裕 2018年8月14日
 * 爬取携程酒店的评论，保存到数据库
 * @type {request}
 */
let cheerio = require('cheerio')
let Sequelize = require('sequelize');
const Nightmare = require('nightmare');
const fs = require('fs');
let nightmare = Nightmare({show: true, waitTimeout: 10000, gotoTimeout: 10000, width: 1920, height: 1080})
let DataTypes = Sequelize.DataTypes
let sequelize = new Sequelize('rujia', 'root', 'root', {
    host: 'localhost',
    dialect: 'mysql',
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    operatorsAliases: false,
    logging: false
});
let CommentTable = sequelize.define('comments_page', {
    cid: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id: DataTypes.INTEGER,
    score: DataTypes.STRING,
    content: DataTypes.STRING(3000),
    imageCount: DataTypes.TINYINT(1),
    isMobile: DataTypes.BOOLEAN,
    hotelName: DataTypes.STRING,
    hotelId: DataTypes.STRING,
    pageUrl: DataTypes.STRING,
    baseRoomName: DataTypes.STRING,
    date: DataTypes.STRING,
    type: DataTypes.STRING,
    userLevel: DataTypes.STRING
}, {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});


const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class Main {
    constructor(mainPageUrl) {
        this.mainPageUrl = mainPageUrl
        this.currentHotelIndex = 0;
        this.hotelCount = 60;
        this.currentUrl = 0
        this.pageUrl = ""
        this.hotelId = ''
        this.hotelName = ""
        let parsedHotel = JSON.parse(fs.readFileSync('./parsedHotel').toString())
        this.parsedHotel = parsedHotel
    }

    async getMainPage() {
        await sequelize.sync()
        let _this = this
        await nightmare.goto(this.mainPageUrl);
        await nightmare.wait('.hotel_new_list')
        await sleep(3000)
        await nightmare.click('#downHerf')
        await sleep(3000)
        await nightmare.click('#downHerf')
        await nightmare.inject('js', './jquery.min.js')
        await sleep(3000)
        let remainCounts = await nightmare.evaluate((parsedHotel) => {
            try {
                let $hotel = $('.hotel_new_list .hotel_item_name a')
                $hotel.removeAttr('target')
                $('.hotel_new_list').each(function (index, item) {
                    let name = $(item).find('.hotel_item_name a').attr('title')
                    console.log(name)
                    console.log(parsedHotel)
                    if (parsedHotel.includes(name)) {
                        $(item).remove()
                    }
                })
                return $('.hotel_new_list').length
            } catch (e) {
                console.log(e)
            }
        }, this.parsedHotel).catch(e => console.error(e))
        console.log({remainCounts})


        fs.writeFileSync('./parsedHotel', JSON.stringify(this.parsedHotel, null, 2))
        await nightmare.click('.hotel_new_list .hotel_item_name a').wait('.hotel_tabs ')
        let hotelInfo = await nightmare.evaluate(() => {
            return {
                currentUrl: location.href,
                hotelName: $('#J_htl_info .name .cn_n').html()
            }
        })
        this.pageUrl = hotelInfo.currentUrl
        this.hotelName = hotelInfo.hotelName
        console.log(hotelInfo)
        this.hotelId = this.pageUrl.match(/\/(\d{0,})\.html/)[1]
        await nightmare.click('#commentTab a').wait('.comment_detail_list')
        await this.nextPage();
    }

    async nextHotel() {
        this.currentHotelIndex++
        this.parsedHotel.push(this.hotelName)
        if (this.currentHotelIndex > this.hotelCount) {
            await nightmare.end()
            console.log('全部完成。。。')
        } else {
            await this.getMainPage()
        }
    }

    async nextPage() {
        await sleep(2000)
        let pageData = await nightmare.evaluate(function () {
            try {
                let currentPage = +$('.c_page_list .current').text()
                let allPage = +$('.c_page_box .c_page_list a').last().text()
                return {currentPage, allPage}
            } catch (e) {
                console.error(e)
            }
        }).catch(e => console.log(e))
        console.log(pageData)
        if (this.currentPage === pageData.currentPage) {
            console.log('ip限制！请明天再试')
            await sleep(100000)
            nightmare.end()
        } else {
            this.currentPage = pageData.currentPage
        }
        this.allPage = pageData.allPage
        let commentListData = await nightmare.evaluate(() => {
            return $('#commentList').html()
        })
        let isContinue = await this.saveData(commentListData)
        if ((this.currentPage < this.allPage) && isContinue) {
            // if (this.currentPage < 2) {
            await nightmare.click('.c_down').wait('.comment_detail_list')
            await this.nextPage()
        } else {
            await this.nextHotel()
        }
    }

    async saveData(commentListData) {
        let _this = this
        let $ = cheerio.load(commentListData, {decodeEntities: false})
        let isContinue = true
        $('.comment_block').each(async (index, item) => {
            if ($(item).find('.score').length === 0) {
                isContinue = false
            } else {
                let saveObj = {}
                saveObj.id = $(item).attr('data-cid')
                saveObj.score = $(item).find('.score .n').text().trim()
                saveObj.content = $(item).find('.J_commentDetail').text().trim()
                saveObj.imageCount = $(item).find('.comment_pic .pic').length
                saveObj.isMobile = $(item).find('.comment_bar .phone').length > 0
                saveObj.hotelName = _this.hotelName
                saveObj.hotelId = _this.hotelId
                saveObj.pageUrl = _this.pageUrl
                saveObj.baseRoomName = $(item).find('.J_baseroom_link').attr('data-baseroomname')
                saveObj.date = ($(item).find('.comment_bar .time').html() || "").replace('发表于', '')
                saveObj.type = $(item).find('.type').text().trim()
                saveObj.userLevel = $(item).find('.name').next('p').attr('class')
                // console.log(saveObj)
                try {
                    await CommentTable.findOrCreate({
                        where: {id: saveObj.id},
                        defaults: saveObj
                    })
                } catch (e) {
                    console.error(e)
                }
            }
        })

        return isContinue
    }
}


(async () => {

    let main = new Main(`http://hotels.ctrip.com/hotel/qingdao7/h110#ctm_ref=hod_hp_sb_lst`);
    await main.getMainPage();
})();





