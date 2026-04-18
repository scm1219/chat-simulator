/**
 * 事件触发系统
 * 预设事件池 + 推荐算法 + 对话平淡检测
 */

import { generateUUID } from '../utils/uuid.js'
import { SCENE_LABELS } from './constants.js'

const DEFAULT_EVENT_POOL = {
  office: [
    { key: 'meeting_called', content: '老板突然通知全员开会', impact: '紧张' },
    { key: 'fire_alarm', content: '消防警报突然响了', impact: '惊慌' },
    { key: 'new_colleague', content: '部门来了一个新同事', impact: '好奇' },
    { key: 'power_outage', content: '办公室突然停电了', impact: '惊讶' },
    { key: 'deadline_reminder', content: '收到提醒：项目截止日期就在明天', impact: '焦虑' },
    { key: 'promotion_rumor', content: '有人在群里说公司要大规模裁员', impact: '恐慌' },
    { key: 'lunch_invite', content: '同事邀请大家一起去吃新开的餐厅', impact: '开心' },
    { key: 'coffee_spill', content: '有人不小心把咖啡洒在了文件上', impact: '尴尬' },
    { key: 'salary_leak', content: '匿名邮件曝光了全公司的薪资表', impact: '震惊' },
    { key: 'ac_breakdown', content: '空调突然坏了，办公室越来越热', impact: '烦躁' },
    { key: 'surprise_inspection', content: '大领导突然来部门视察', impact: '紧张' },
    { key: 'group_photo', content: '行政通知全员到楼下拍集体照', impact: '无奈' },
    { key: 'overtime_notice', content: '群里发了周末加班通知', impact: '沮丧' },
    { key: 'birthday_cake', content: '有人推着生日蛋糕走进办公室', impact: '惊喜' },
    { key: 'wifi_down', content: '公司 WiFi 突然断了', impact: '焦虑' },
    { key: 'praise_email', content: '老板群发邮件表扬了一个项目组', impact: '嫉妒' }
  ],
  home: [
    { key: 'door_knock', content: '有人敲门', impact: '好奇' },
    { key: 'package_arrived', content: '快递到了一个神秘包裹', impact: '好奇' },
    { key: 'pet_mischief', content: '宠物把东西打翻了', impact: '无奈' },
    { key: 'phone_rings', content: '一个陌生号码打来电话', impact: '紧张' },
    { key: 'power_out', content: '家里突然停电了', impact: '惊讶' },
    { key: 'water_leak', content: '厨房水管突然漏水了', impact: '焦急' },
    { key: 'neighbor_music', content: '隔壁邻居突然放起了很大声的音乐', impact: '烦躁' },
    { key: 'delivery_wrong', content: '外卖送错了，送来了一份豪华大餐', impact: '惊讶' },
    { key: 'bug_found', content: '发现墙上爬了一只大蟑螂', impact: '惊慌' },
    { key: 'old_photo', content: '收拾房间时翻出一张老照片', impact: '感慨' },
    { key: 'window_rain', content: '窗外突然狂风暴雨，窗户没关', impact: '紧张' },
    { key: 'smoke_alarm', content: '厨房烟雾报警器突然响了', impact: '惊慌' },
    { key: 'unexpected_visit', content: '亲戚突然说要来家里住几天', impact: '无奈' },
    { key: 'knock_furniture', content: '走路不小心撞到了脚趾', impact: '痛苦' }
  ],
  school: [
    { key: 'exam_announced', content: '老师宣布明天突击考试', impact: '恐慌' },
    { key: 'transfer_student', content: '班上来了一个转学生', impact: '好奇' },
    { key: 'confiscated', content: '手机被老师没收了', impact: '沮丧' },
    { key: 'cheating_caught', content: '有人考试作弊被抓到了', impact: '紧张' },
    { key: 'field_trip', content: '老师宣布下周去秋游', impact: '兴奋' },
    { key: 'bully_confront', content: '有人在校门口被堵了', impact: '紧张' },
    { key: 'love_letter', content: '有人发现课桌里有一封匿名情书', impact: '好奇' },
    { key: 'result_posted', content: '期末成绩单贴在了公告栏上', impact: '焦虑' },
    { key: 'food_fight', content: '食堂里两个人因为插队吵了起来', impact: '紧张' },
    { key: 'teacher_late', content: '上课十分钟了老师还没来', impact: '窃喜' },
    { key: 'banned_phone', content: '学校出新规禁止带手机进校园', impact: '愤怒' },
    { key: 'sports_day', content: '运动会报名开始了，班级之间打赌', impact: '兴奋' },
    { key: 'secret_note', content: '有人传纸条被老师截获了', impact: '尴尬' },
    { key: 'fire_drill', content: '突然响起了消防演习警报', impact: '惊讶' }
  ],
  restaurant: [
    { key: 'wrong_order', content: '服务员上错了菜，端来了一桌别人的宴席', impact: '尴尬' },
    { key: 'famous_person', content: '有个明星走进了餐厅', impact: '惊讶' },
    { key: 'proposal', content: '隔壁桌突然有人求婚了', impact: '感动' },
    { key: 'mouse_sighting', content: '有人看到一只老鼠从脚边跑过', impact: '惊慌' },
    { key: 'power_out', content: '餐厅突然停电了，一片漆黑', impact: '紧张' },
    { key: 'free_bill', content: '老板说今天全场免单', impact: '惊喜' },
    { key: 'singing_table', content: '隔壁桌开始大声唱歌划拳', impact: '烦躁' },
    { key: 'spill_wine', content: '有人不小心打翻了红酒，溅到了旁边', impact: '尴尬' },
    { key: 'long_queue', content: '门口排起了很长的队，里面却还有很多空位', impact: '困惑' },
    { key: 'cooking_fire', content: '后厨突然冒出了浓烟', impact: '惊慌' },
    { key: 'ex_gf_arrive', content: '有人带着新对象进来了，碰到了前任', impact: '尴尬' }
  ],
  travel: [
    { key: 'missed_train', content: '突然发现坐错了车，坐反了方向', impact: '惊慌' },
    { key: 'lost_luggage', content: '到了酒店发现行李没跟上', impact: '焦虑' },
    { key: 'beautiful_view', content: '转过一个弯，眼前出现了一片绝美风景', impact: '惊叹' },
    { key: 'local_friend', content: '在路上遇到一个热情的当地人带路', impact: '开心' },
    { key: 'flat_tire', content: '车胎爆了，前不着村后不着店', impact: '焦急' },
    { key: 'photo_opportunity', content: '遇到了一群野生动物，太适合拍照了', impact: '兴奋' },
    { key: 'language_barrier', content: '菜单全是外文，一个字都看不懂', impact: '无奈' },
    { key: 'sudden_rain', content: '晴空万里突然下起了暴雨', impact: '无奈' },
    { key: 'wallet_missing', content: '摸口袋发现钱包不见了', impact: '惊慌' },
    { key: 'scenic_spot_closed', content: '好不容易到了景点，发现今天闭馆', impact: '沮丧' },
    { key: 'local_food', content: '路边摊吃到一碗超好吃的面', impact: '满足' },
    { key: 'detour', content: '导航导到了一条荒无人烟的小路', impact: '紧张' }
  ],
  party: [
    { key: 'uninvited', content: '一个谁都不认识的人突然出现在派对上', impact: '尴尬' },
    { key: 'karaoke_hog', content: '有人霸占麦克风已经唱了半小时了', impact: '无奈' },
    { key: 'drink_spill', content: '有人打翻了酒杯洒了一地', impact: '尴尬' },
    { key: 'secret_reveal', content: '有人喝多了开始说别人的秘密', impact: '紧张' },
    { key: 'power_out', content: '正在嗨的时候突然停电了', impact: '惊慌' },
    { key: 'late_arrival', content: '一个很重要的人终于到了', impact: '开心' },
    { key: 'song_request', content: '有人点了一首超级难听的歌', impact: '尴尬' },
    { key: 'gate_crash', content: '邻居过来投诉声音太大', impact: '尴尬' },
    { key: 'dance_off', content: '两个人开始比舞，大家都围过来看', impact: '兴奋' },
    { key: 'toast_accident', content: '碰杯的时候酒杯碎了', impact: '尴尬' },
    { key: 'ex_encounter', content: '在派对上碰到了前任', impact: '尴尬' },
    { key: 'surprise_gift', content: '有人拿出了一个巨大的蛋糕', impact: '惊喜' }
  ],
  general: [
    { key: 'breaking_news', content: '手机弹窗推送了一条重大新闻', impact: '惊讶' },
    { key: 'heated_argument', content: '两个人突然吵了起来', impact: '紧张' },
    { key: 'sudden_silence', content: '所有人突然安静了下来', impact: '尴尬' },
    { key: 'rain_start', content: '窗外突然下起了大雨', impact: '平静' },
    { key: 'earthquake', content: '地面突然晃了一下', impact: '惊慌' },
    { key: 'phone_dead', content: '所有人的手机同时没信号了', impact: '惊讶' },
    { key: 'stranger_wave', content: '一个路人突然冲大家挥了挥手就走了', impact: '困惑' },
    { key: 'money_found', content: '地上捡到了一个钱包', impact: '惊讶' },
    { key: 'sudden_cold', content: '气温突然骤降，冻得人直哆嗦', impact: '无奈' },
    { key: 'dog_chase', content: '一只没拴绳的大狗冲了过来', impact: '惊慌' },
    { key: 'fireworks', content: '远处突然放起了烟花', impact: '惊喜' },
    { key: 'wrong_number', content: '有人打错了电话，但聊得停不下来', impact: '好奇' },
    { key: 'celebrity_encounter', content: '路边遇到了一个明星', impact: '惊讶' },
    { key: 'sudden_thunder', content: '一声巨响的炸雷', impact: '惊吓' },
    { key: 'lost_item_found', content: '有人捡到了之前丢失的东西', impact: '惊喜' }
  ]
}

export class EventTrigger {
  constructor() {
    this.eventPool = { ...DEFAULT_EVENT_POOL }
  }

  getEventPool(sceneType = 'general') {
    const sceneEvents = this.eventPool[sceneType] || []
    const generalEvents = this.eventPool.general || []
    const allKeys = new Set([...sceneEvents.map(e => e.key), ...generalEvents.map(e => e.key)])
    const allEvents = {}
    for (const key of allKeys) {
      const found = sceneEvents.find(e => e.key === key) || generalEvents.find(e => e.key === key)
      if (found) allEvents[key] = found
    }
    return Object.values(allEvents)
  }

  triggerEvent(db, groupId, eventKey, content, impact, triggeredBy = 'user') {
    const id = generateUUID()
    // 手动触发事件使用 event_key + 时间戳后缀，避免与预设事件 key 冲突导致去重误判
    const actualKey = triggeredBy === 'user' ? `${eventKey}_${Date.now()}` : eventKey
    db.prepare(`
      INSERT INTO narrative_events (id, group_id, event_key, content, impact, event_type, triggered_by, created_at)
      VALUES (?, ?, ?, ?, ?, 'user_triggered', ?, datetime('now', 'localtime'))
    `).run(id, groupId, actualKey, content, impact, triggeredBy)
    return { id, eventKey: actualKey, content, impact, eventType: 'user_triggered', triggeredBy }
  }

  getEventSuggestions(db, groupId, sceneType, count = 3) {
    const allEvents = this.getEventPool(sceneType)
    const recentEvents = db.prepare(`
      SELECT event_key, content FROM narrative_events WHERE group_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(groupId)
    // 去重：提取基础 key（去掉手动触发的时间戳后缀）进行匹配
    const recentBaseKeys = new Set(recentEvents.map(e => e.event_key.replace(/_\d+$/, '')))
    const available = allEvents.filter(e => !recentBaseKeys.has(e.key))
    const shuffled = available.sort(() => Math.random() - 0.5)
    return shuffled.slice(0, count)
  }

  checkStaleness(db, groupId) {
    const recentMessages = db.prepare(`
      SELECT content FROM messages
      WHERE group_id = ? AND role IN ('user', 'assistant')
      ORDER BY timestamp DESC LIMIT 10
    `).all(groupId)
    if (recentMessages.length < 5) return { stale: false, reason: null }
    const avgLength = recentMessages.slice(0, 5).reduce((sum, m) => sum + (m.content?.length || 0), 0) / 5
    if (avgLength < 20) {
      return { stale: true, reason: '对话内容较短，可能趋于平淡' }
    }
    const hasAtInteraction = recentMessages.slice(0, 5).some(m => /@[^\s\u3000]+/.test(m.content || ''))
    if (!hasAtInteraction) {
      return { stale: true, reason: '近期没有角色间互动' }
    }
    return { stale: false, reason: null }
  }

  getRecentEvents(db, groupId, limit = 10) {
    return db.prepare(`
      SELECT * FROM narrative_events WHERE group_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(groupId, limit)
  }

  deleteEvent(db, eventId) {
    const result = db.prepare('DELETE FROM narrative_events WHERE id = ?').run(eventId)
    return result.changes > 0
  }

  /**
   * 根据 event_key 查找所属场景标签
   * @param {string} eventKey 事件 key（可能含手动触发的时间戳后缀）
   * @returns {string} 场景中文标签
   */
  getEventSceneLabel(eventKey) {
    const baseKey = eventKey.replace(/_\d+$/, '')
    for (const [scene, events] of Object.entries(this.eventPool)) {
      if (events.some(e => e.key === baseKey)) {
        return SCENE_LABELS[scene] || scene
      }
    }
    return '自定义'
  }
}
