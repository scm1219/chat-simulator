/**
 * 叙事引擎共享常量
 * 统一情绪词典、关系类型、好感度等级、互动模式、事件-情绪映射
 */

// 完整情绪关键词词典（15 种）
export const EMOTION_KEYWORDS = {
  '开心':   { words: ['哈哈', '嘿嘿', '太好了', '棒', '开心', '喜欢', '爱你'], intensity: 0.6 },
  '愤怒':   { words: ['闭嘴', '烦死', '滚', '笨蛋', '混蛋', '气死', '废物'], intensity: 0.8 },
  '尴尬':   { words: ['那个...', '咳', '不是', '误会', '其实不是'], intensity: 0.5 },
  '感动':   { words: ['谢谢', '谢谢你', '太感动', '没想到', '你真好'], intensity: 0.7 },
  '悲伤':   { words: ['难过', '伤心', '不想说', '算了', '无所谓了'], intensity: 0.6 },
  '惊讶':   { words: ['啊？', '什么？', '不会吧', '真的假的', '不可能'], intensity: 0.7 },
  '嫉妒':   { words: ['凭什么', '羡慕', '不公平', '为什么不是我'], intensity: 0.6 },
  '疲惫':   { words: ['累了', '困', '无聊', '不想聊了', '打哈欠'], intensity: 0.4 },
  '紧张':   { words: ['心跳加速', '手心出汗', '不安', '忐忑', '紧张', '怎么办'], intensity: 0.6 },
  '惊慌':   { words: ['天哪', '救命', '快跑', '别过来', '不要', '完了完了'], intensity: 0.8 },
  '好奇':   { words: ['为什么', '怎么回事', '真的吗', '为什么呀', '为什么呢', '好想知道'], intensity: 0.5 },
  '无奈':   { words: ['算了', '随便吧', '没办法', '无所谓', '就这样吧', '唉'], intensity: 0.4 },
  '沮丧':   { words: ['又失败了', '没希望了', '好失望', '不可能了', '没戏了'], intensity: 0.6 },
  '焦虑':   { words: ['来不及了', '好担心', '等不及了', '什么时候', '急死'], intensity: 0.6 },
  '恐慌':   { words: ['完蛋了', '死定了', '糟了', '救命啊', '完了'], intensity: 0.8 }
}

// 预设关系类型（7 种）
export const RELATIONSHIP_TYPES = {
  friend:    { label: '朋友',   defaultFavor: 30,  promptHint: '友好、亲近、会开玩笑' },
  lover:     { label: '恋人',   defaultFavor: 70,  promptHint: '亲密、温柔、关心对方' },
  rival:     { label: '对手',   defaultFavor: -20, promptHint: '竞争、不服气、暗中较劲' },
  mentor:    { label: '师徒',   defaultFavor: 40,  promptHint: '尊重但保持距离、偶尔严厉' },
  colleague: { label: '同事',   defaultFavor: 10,  promptHint: '礼貌、合作、有分寸' },
  family:    { label: '家人',   defaultFavor: 50,  promptHint: '随意、亲密、说话不加修饰' },
  stranger:  { label: '陌生人', defaultFavor: 0,   promptHint: '客气、试探、保持距离' }
}

// 好感度等级（6 级）
export const FAVORABILITY_LEVELS = [
  { min: 70,  max: 100, label: '深厚', hint: '无条件信任，会为对方出头' },
  { min: 40,  max: 69,  label: '亲密', hint: '主动分享，会维护对方' },
  { min: 10,  max: 39,  label: '友好', hint: '正常交流，偶尔关心' },
  { min: -10, max: 9,   label: '中立', hint: '礼貌但疏远' },
  { min: -50, max: -11, label: '不满', hint: '带有负面情绪，说话带刺' },
  { min: -100, max: -51, label: '敌对', hint: '极度厌恶，言辞尖锐，可能拒绝交流' }
]

// 互动模式（4 类）
export const INTERACTION_PATTERNS = [
  { type: 'praise',    words: ['你说得对', '谢谢你', '厉害', '不错', '真棒', '佩服'], range: [3, 8] },
  { type: 'criticize', words: ['你错了', '别说了', '无聊', '差劲', '胡说'], range: [-8, -3] },
  { type: 'share',     words: ['我觉得', '我之前', '告诉你', '其实我'], range: [2, 5] },
  { type: 'empathy',   words: ['我也', '同感', '理解', '我也是'], range: [2, 5] }
]

// 事件 impact 到标准情绪的映射
// 事件池中使用了非标准情绪词，需要映射到 EMOTION_KEYWORDS 中定义的标准情绪
export const EVENT_EMOTION_MAP = {
  '焦急': '焦虑',
  '窃喜': '开心',
  '震惊': '惊讶',
  '兴奋': '开心',
  '满足': '开心',
  '痛苦': '悲伤',
  '感慨': '无奈',
  '困惑': '好奇',
  '惊喜': '开心',
  '惊吓': '惊慌',
  '烦躁': '愤怒',
  '平静': '平静'
}

// 事件场景类型标签（7 种）
export const SCENE_LABELS = {
  office: '办公室',
  home: '家庭',
  school: '校园',
  restaurant: '餐厅',
  travel: '旅行',
  party: '聚会',
  general: '通用'
}

// 语气提示映射
export const TONE_HINTS = {
  '开心': '请用轻快、主动的语气回复',
  '愤怒': '请用带有攻击性、不耐烦的语气回复',
  '尴尬': '请用支支吾吾、回避的语气回复',
  '感动': '请用真诚、柔和的语气回复',
  '悲伤': '请用低沉、沉默的语气回复',
  '惊讶': '请用激动、急促的语气回复',
  '嫉妒': '请用酸溜溜、阴阳怪气的语气回复',
  '疲惫': '请用懒散、敷衍的语气回复',
  '紧张': '请用不安、焦急的语气回复',
  '惊慌': '请用慌乱、急切的语气回复',
  '恐慌': '请用极度不安的语气回复',
  '好奇': '请用好奇、期待的语气回复',
  '无奈': '请用叹气、妥协的语气回复',
  '沮丧': '请用低落、消极的语气回复',
  '焦虑': '请用急躁、担忧的语气回复'
}

/**
 * 获取好感度等级信息
 * @param {number} favorability 好感度值
 * @returns {{ label: string, hint: string }}
 */
export function getFavorabilityLevel(favorability) {
  return FAVORABILITY_LEVELS.find(l => favorability >= l.min && favorability <= l.max) || FAVORABILITY_LEVELS[3]
}

/**
 * 获取关系类型标签
 * @param {string} type 关系类型 key
 * @returns {{ label: string, defaultFavor?: number, promptHint?: string }}
 */
export function getRelationshipType(type) {
  return RELATIONSHIP_TYPES[type] || { label: type || '陌生人' }
}

/**
 * 将事件 impact 映射为标准情绪词
 * @param {string} impact 事件 impact 值
 * @returns {string} 标准情绪词
 */
export function mapEventImpactToEmotion(impact) {
  if (EMOTION_KEYWORDS[impact]) return impact
  return EVENT_EMOTION_MAP[impact] || '惊讶'
}
