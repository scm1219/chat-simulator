/**
 * 叙事上下文 Prompt 构建器
 * 将情绪、关系、事件状态注入 LLM system prompt
 */

export class NarrativePromptBuilder {

  buildNarrativeContext(db, characterId, groupId, allCharacters) {
    const contextMessages = []
    const emotionSection = this._buildEmotionSection(db, allCharacters)
    if (emotionSection) {
      contextMessages.push({ role: 'system', content: emotionSection })
    }
    const relationshipSection = this._buildRelationshipSection(db, characterId, allCharacters)
    if (relationshipSection) {
      contextMessages.push({ role: 'system', content: relationshipSection })
    }
    const eventSection = this._buildEventSection(db, groupId)
    if (eventSection) {
      contextMessages.push({ role: 'system', content: eventSection })
    }
    return contextMessages
  }

  buildAftermathPrompt(db, groupId, allCharacters, recentMessages) {
    const emotionSection = this._buildEmotionSection(db, allCharacters)
    const relationshipSection = this._buildRelationshipSectionForAll(db, allCharacters)
    const recentChat = recentMessages.slice(-10).map(m => {
      const prefix = m.role === 'assistant' ? (m.character_name || '角色') : '用户'
      return `${prefix}：${m.content}`
    }).join('\n')

    return `基于以上对话，请生成 1-3 条角色间的简短追评或互动。
要求：
- 只写角色之间的互动，不要回应用户
- 每条不超过 50 字
- 角色语气需符合当前情绪和关系
- 不是每个角色都要发言，只写自然会有反应的角色
- 输出格式：角色名：内容

${emotionSection ? emotionSection + '\n' : ''}${relationshipSection ? relationshipSection + '\n' : ''}
最近对话：
${recentChat}`
  }

  _buildEmotionSection(db, allCharacters) {
    const emotions = db.prepare('SELECT * FROM character_emotions WHERE intensity > 0.1').all()
    if (emotions.length === 0) return ''
    const characterMap = new Map(allCharacters.map(c => [c.id, c.name]))
    const lines = emotions.map(e => {
      const name = characterMap.get(e.character_id) || '未知角色'
      const toneHint = this._getToneHint(e.emotion)
      return `- ${name}（当前情绪：${e.emotion} ${e.intensity.toFixed(1)}）— ${toneHint}`
    })
    return `【角色情绪状态】\n${lines.join('\n')}`
  }

  _buildRelationshipSection(db, characterId, allCharacters) {
    const relationships = db.prepare(
      'SELECT * FROM character_relationships WHERE from_id = ?'
    ).all(characterId)
    if (relationships.length === 0) return ''
    const characterMap = new Map(allCharacters.map(c => [c.id, c.name]))
    const lines = relationships.map(r => {
      const toName = characterMap.get(r.to_id) || '未知角色'
      const level = this._getFavorabilityLevel(r.favorability)
      const typeConfig = this._getRelationshipType(r.type)
      return `- ${characterMap.get(characterId) || '你'} → ${toName}：${typeConfig.label}（好感度 ${r.favorability}，${level.label}）— ${level.hint}`
    })
    return `【角色关系】\n${lines.join('\n')}`
  }

  _buildRelationshipSectionForAll(db, allCharacters) {
    const relationships = db.prepare('SELECT * FROM character_relationships').all()
    if (relationships.length === 0) return ''
    const characterMap = new Map(allCharacters.map(c => [c.id, c.name]))
    const lines = relationships.map(r => {
      const fromName = characterMap.get(r.from_id) || '未知'
      const toName = characterMap.get(r.to_id) || '未知'
      const level = this._getFavorabilityLevel(r.favorability)
      const typeConfig = this._getRelationshipType(r.type)
      return `- ${fromName} → ${toName}：${typeConfig.label}（好感度 ${r.favorability}，${level.label}）`
    })
    return `【角色关系】\n${lines.join('\n')}`
  }

  _buildEventSection(db, groupId) {
    const events = db.prepare(`
      SELECT * FROM narrative_events WHERE group_id = ?
      AND datetime(created_at) > datetime('now', 'localtime', '-1 hour')
      ORDER BY created_at DESC LIMIT 3
    `).all(groupId)
    if (events.length === 0) return ''
    const lines = events.map(e => `[${e.event_type === 'user_triggered' ? '事件' : '自动事件'}] ${e.content}`)
    return `【当前事件】\n${lines.join('\n')}\n（请根据自己的人设、情绪和关系做出反应）`
  }

  _getToneHint(emotion) {
    const hints = {
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
    return hints[emotion] || '请根据情绪调整语气'
  }

  _getFavorabilityLevel(favorability) {
    if (favorability >= 70) return { label: '深厚', hint: '无条件信任，会为对方出头' }
    if (favorability >= 40) return { label: '亲密', hint: '主动分享，会维护对方' }
    if (favorability >= 10) return { label: '友好', hint: '正常交流，偶尔关心' }
    if (favorability >= -10) return { label: '中立', hint: '礼貌但疏远' }
    if (favorability >= -50) return { label: '不满', hint: '带有负面情绪，说话带刺' }
    return { label: '敌对', hint: '极度厌恶，言辞尖锐，可能拒绝交流' }
  }

  _getRelationshipType(type) {
    const types = {
      friend: { label: '朋友' }, lover: { label: '恋人' }, rival: { label: '对手' },
      mentor: { label: '师徒' }, colleague: { label: '同事' }, family: { label: '家人' },
      stranger: { label: '陌生人' }
    }
    return types[type] || { label: type || '陌生人' }
  }
}
