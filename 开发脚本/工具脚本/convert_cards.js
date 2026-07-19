const fs = require('fs');

const civ = JSON.parse(fs.readFileSync('C:/Users/windows11/Downloads/main_civ-simulator_json.json', 'utf8'));
const yml = JSON.parse(fs.readFileSync('C:/Users/windows11/Downloads/main_yes-my-liege_json.json', 'utf8'));

function convertToWorld(d) {
  const traits = (d.data?.personality || '').split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
  const mesExample = d.data?.mes_example || d.data?.first_mes || '';
  
  return {
    name: d.data?.name || d.name || '导入世界',
    type: 'custom',
    description: (d.data?.description || '').slice(0, 500),
    systemPrompt: (d.data?.system_prompt || d.data?.creator_notes || ''),
    scenario: d.data?.scenario || '',
    traits: traits,
    firstMessage: mesExample.slice(0, 500),
    exampleDialogues: typeof mesExample === 'string' ? mesExample.split('\n').filter(l => l.trim().length > 5).slice(0, 8) : [],
  };
}

const civWorld = convertToWorld(civ);
const ymlWorld = convertToWorld(yml);

fs.writeFileSync('C:/Users/windows11/Desktop/Koyoi_CivSimulator.json', JSON.stringify(civWorld, null, 2));
fs.writeFileSync('C:/Users/windows11/Desktop/Koyoi_YesMyLiege.json', JSON.stringify(ymlWorld, null, 2));
console.log('converted to Desktop');
console.log('Civ:', civWorld.name);
console.log('YML:', ymlWorld.name);
