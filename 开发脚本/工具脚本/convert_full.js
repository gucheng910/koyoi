const fs = require('fs');

const files = [
  { src: 'C:/Users/windows11/Downloads/main_civ-simulator_json.json', dst: 'C:/Users/windows11/Desktop/Koyoi_CivSimulator.json' },
  { src: 'C:/Users/windows11/Downloads/main_yes-my-liege_json.json', dst: 'C:/Users/windows11/Desktop/Koyoi_YesMyLiege.json' },
];

for (const { src, dst } of files) {
  const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
  const data = raw.data || raw;

  // 完整保留原卡所有文本内容
  const fullCard = {
    // 原始格式标识
    _format: 'character_card_v2',
    _original_keys: Object.keys(raw),
    
    name: data.name || raw.name,
    description: data.description || '',
    personality: data.personality || '',
    scenario: data.scenario || '',
    first_mes: data.first_mes || '',
    mes_example: data.mes_example || '',
    system_prompt: data.system_prompt || '',
    creator_notes: data.creator_notes || '',
    post_history_instructions: data.post_history_instructions || '',
    alternate_greetings: data.alternate_greetings || [],
    tags: data.tags || [],
    extensions: data.extensions || {},
    character_version: data.character_version || '',
    creator: data.creator || '',
    
    // 完整原始数据
    _raw: raw,
  };

  fs.writeFileSync(dst, JSON.stringify(fullCard, null, 2));
  console.log(fullCard.name);
  console.log('  description:', (fullCard.description || '').length, 'chars');
  console.log('  personality:', (fullCard.personality || '').length, 'chars');
  console.log('  system_prompt:', (fullCard.system_prompt || '').length, 'chars');
  console.log('  first_mes:', (fullCard.first_mes || '').length, 'chars');
  console.log('  mes_example:', (fullCard.mes_example || '').length, 'chars');
  console.log('');
}

console.log('full cards saved to Desktop');
