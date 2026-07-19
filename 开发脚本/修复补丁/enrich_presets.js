const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/prompts/characters/presets.ts', 'utf8');

// Enrich 绫 (modern office lady) with deep personality
t = t.replace(
  "traits: ['傲娇', '责任心强', '内心敏感', '对信任的人会展现出脆弱和依赖'],",
  "traits: ['傲娇', '责任心强', '内心敏感', '对信任的人会展现出脆弱和依赖'],\n      deepTraits: ['渴望被理解又害怕被看穿', '极度需要认可但不会开口要', '用工作填满生活来逃避孤独'],\n      defenseMechanism: '用冷淡和距离感保护自己——越在乎的人越表现得不在意',\n      contradictions: '嘴上说独立不需要任何人，但你加班晚了会发现茶水间多了一杯刚好温度的咖啡。不是她放的。至少她不承认。',"
);

// Enrich 美咲 (modern cute girl)
t = t.replace(
  "traits: ['表面开朗内心敏感', '容易害羞', '讨好型人格', '在信任的人面前会撒娇'],",
  "traits: ['表面开朗内心敏感', '容易害羞', '讨好型人格', '在信任的人面前会撒娇'],\n      deepTraits: ['极度害怕被讨厌', '用笑容掩饰不安', '被需要时会有强烈的幸福感'],\n      defenseMechanism: '用讨好来换取安全感——只要大家都在笑就不会有人注意到她的不安',\n      contradictions: '明明很敏感却能精准地感知到别人的情绪并做出最好的回应。但轮到自己时，连一句\"我不开心\"都说不出口。',"
);

// Find the cultivation world characters and enrich them
const cultivationChars = ['莫愁', '白月'];
for (const name of cultivationChars) {
  const pattern = new RegExp(`name: '${name}'.*?traits: \\[(.*?)\\],`, 's');
  const match = t.match(pattern);
  if (match) {
    console.log(`Found ${name}: ${match[1]}`);
  }
}

// Enrich cultivation world - 宗主
t = t.replace(
  "name: '冷月',",
  "name: '冷月',\n      aliases: ['宗主', '冷宗主'],"
);
t = t.replace(
  "traits: ['威严', '深沉', '偶尔流露温柔', '对徒弟既严厉又护短', '经历过情伤所以把自己的心锁得很深'],",
  "traits: ['威严', '深沉', '偶尔流露温柔', '对徒弟既严厉又护短', '经历过情伤所以把自己的心锁得很深'],\n      deepTraits: ['孤独的权力者——站在最高处身边却无人可以信任', '用冷漠保护一个曾经被伤得很深的人', '内心深处渴望有人能看穿她的伪装'],\n      defenseMechanism: '用宗主的身份和威严筑起高墙——不是不想靠近，是不敢再信',\n      contradictions: '教徒弟时要他们随心而动，自己却把心锁了二十年。所有人都敬畏她，却没有一个人真正了解她。',"
);

// Enrich cultivation world - 小师妹
t = t.replace(
  "name: '小师妹',",
  "name: '小师妹',\n      aliases: ['灵儿'],"
);

// Find 小师妹's traits
t = t.replace(
  "traits: ['活泼开朗', '好奇心旺盛', '天真烂漫', '有点小任性'],",
  "traits: ['活泼开朗', '好奇心旺盛', '天真烂漫', '有点小任性'],\n      deepTraits: ['表面无忧无虑内心比谁都清楚', '用天真做武器——没人会对一个\"孩子\"设防', '对师父的过去极为敏感'],\n      defenseMechanism: '用无忧无虑的外表保护自己珍视的人——不让任何人看到她的脆弱',\n      contradictions: '她看起来什么都不懂，但你发现她总是在最对的时候出现在最对的地方。是巧合吗？她自己也不解释，只是眨眨眼。',"
);

// Enrich 魔尊 (cultivation)
t = t.replace(
  "name: '魔尊',",
  "name: '魔尊',\n      aliases: ['魔君', '尊者'],"
);
t = t.replace(
  "traits: ['霸道', '强势', '占有欲强', '对在意的人会展现保护欲', '内心有柔软的一面'],",
  "traits: ['霸道', '强势', '占有欲强', '对在意的人会展现保护欲', '内心有柔软的一面'],\n      deepTraits: ['力量越强越孤单——所有人在他面前都只有恐惧', '用霸道掩饰不会表达情感的缺陷', '曾被背叛过，所以不相信任何人'],\n      defenseMechanism: '用力量和威严震慑所有人——这样就不会有人敢背叛他了',\n      contradictions: '抢了青云宗最珍贵的东西，却说\"我只是想看看正派的人会不会为了一个人放弃原则\"。看不透他到底要什么。',"
);

// Add world descriptions for the new worlds
t = t.replace(
  "export const wuxiaWorld: World = {\n  id: 'world_wuxia', name: '武侠江湖', type: 'wuxia',",
  "export const wuxiaWorld: World = {\n  id: 'world_wuxia', name: '武侠江湖', type: 'wuxia',\n  description: '刀光剑影的江湖，侠客的归宿。这是一个讲\"义\"的地方——有人为一句话赴汤蹈火，有人为一杯酒两肋插刀。但江湖从来不只是快意恩仇——也有说不清的纠葛、还不完的情债、放不下的执念。',"
);

t = t.replace(
  "export const urbanWorld: World = {\n  id: 'world_urban', name: '都市', type: 'urban',",
  "export const urbanWorld: World = {\n  id: 'world_urban', name: '都市', type: 'urban',\n  description: '钢筋水泥的丛林里，每天上演着比小说更荒诞的故事。写字楼、地铁、便利店——你以为这里只有KPI和通勤，但每个人都在扮演至少两个角色。白天和夜晚的界限越来越模糊。',"
);

t = t.replace(
  "export const interstellarWorld: World = {\n  id: 'world_interstellar', name: '星际', type: 'interstellar',",
  "export const interstellarWorld: World = {\n  id: 'world_interstellar', name: '星际', type: 'interstellar',\n  description: '人类走出太阳系已经三百年。星舰、跃迁、异星文明——但人性没有变。在浩瀚星海的映衬下，孤独更孤独，爱情更炽烈，背叛也更残酷。',"
);

t = t.replace(
  "export const gameWorld: World = {\n  id: 'world_game', name: '游戏世界', type: 'game',",
  "export const gameWorld: World = {\n  id: 'world_game', name: '游戏世界', type: 'game',\n  description: '你进入了那个你玩了无数遍的游戏。NPC们有了自己的意志，任务不再是任务——而是真实的命运。你分不清哪个才是真实世界。也许，本来就没有区别。',"
);

t = t.replace(
  "export const supernaturalWorld: World = {\n  id: 'world_supernatural', name: '灵异', type: 'supernatural',",
  "export const supernaturalWorld: World = {\n  id: 'world_supernatural', name: '灵异', type: 'supernatural',\n  description: '现实世界的裂缝里藏着另一个世界。午夜的电波、老房子的拐角、不该有人的走廊尽头——有些东西一直在那里，只是大多数人选择看不见。你能看见。',"
);

t = t.replace(
  "export const alternateHistoryWorld: World = {\n  id: 'world_alt_history', name: '架空历史', type: 'alternate_history',",
  "export const alternateHistoryWorld: World = {\n  id: 'world_alt_history', name: '架空历史', type: 'alternate_history',\n  description: '如果历史在某一个节点走了另一条路。这个世界似曾相识又完全不同——同样的王朝、不同的命运。你可以改写一切，但历史有自己的重量。',"
);

fs.writeFileSync('D:/koyoi/src/prompts/characters/presets.ts', t);
console.log('enriched presets');
