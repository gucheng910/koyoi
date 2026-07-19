const fs = require('fs');

// === 1. 优化 FanficScreen buildOpening prompt ===
let ff = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

// 替换整个 buildOpening 函数中的 prompt 构建部分
const oldSys = "'你是世界构建引擎。基于原著分析结果，为玩家创建同人穿越世界。\\n1. worldBible：200-400字世界观概要\\n2. scene：200-400字开场场景（第二人称\"你\"）\\n3. npcs：2-5个初始在场NPC [{name,role,personality,currentStatus}]\\n4. worldState：一句话世界局势\\n只返回JSON。'";

const newSys = "'你是世界构建引擎。你正在为一个玩家创建身临其境的小说世界开场。\\n你的任务：基于下面的原著分析和穿越设定，生成：\\n1. worldBible：200-300字世界概况（时代背景、权力结构、核心矛盾）\\n2. scene：300-400字开场叙事（必须用第二人称\"你\"写作，从一个具体瞬间开始）\\n3. npcs：2-5个初始在场的NPC，每个有name,role,personality,currentStatus\\n4. worldState：一句话当前世界局势\\n\\n开场写法要求：\\n- 不要写说明书。不要解释世界观。\\n- 从一个感官细节开始：一个声音、一种气味、一次触碰。\\n- 自然融入穿越设定。如果魂穿，写出角色身体与意识之间的微妙错位感。\\n- 让玩家立刻感到\"我在这里\"。\\n- 结尾留下悬念或期待，让玩家想继续。\\n\\n只返回JSON，不要任何解释。'";

ff = ff.replace(oldSys, newSys);

// Simplify user message - reduce to essentials only
const oldUserStart = "const prompt = [\n      { role: 'system' as const, content: '你是世界构建引擎。基于原著分析结果，为玩家创建同人穿越世界。\\n1. worldBible：200-400字世界观概要\\n2. scene：200-400字开场场景（第二人称\"你\"）\\n3. npcs：2-5个初始在场NPC [{name,role,personality,currentStatus}]\\n4. worldState：一句话世界局势\\n只返回JSON。' },\n      { role: 'user' as const, content: [";

const newUserStart = "const userContent = [";

ff = ff.replace(oldUserStart, newUserStart);

// 现在找到 userContent 的结尾并正确闭合
const userContentEnd = ff.indexOf("].filter(Boolean).join('\\n') },", ff.indexOf('const userContent = ['));
if (userContentEnd > 0) {
  ff = ff.slice(0, userContentEnd) + 
    "].filter(Boolean).join('\\n');\n\n    const prompt = [\n      { role: 'system' as const, content: '你是世界构建引擎。你正在为一个玩家创建身临其境的小说世界开场。\\n你的任务：基于下面的原著分析和穿越设定，生成：\\n1. worldBible：200-300字世界概况（时代背景、权力结构、核心矛盾）\\n2. scene：300-400字开场叙事（必须用第二人称\"你\"写作，从一个具体瞬间开始）\\n3. npcs：2-5个初始在场的NPC，每个有name,role,personality,currentStatus\\n4. worldState：一句话当前世界局势\\n\\n开场写法要求：\\n- 不要写说明书。不要解释世界观。\\n- 从一个感官细节开始：一个声音、一种气味、一次触碰。\\n- 自然融入穿越设定。如果魂穿，写出角色身体与意识之间的微妙错位感。\\n- 让玩家立刻感到\"我在这里\"。\\n- 结尾留下悬念或期待，让玩家想继续。\\n\\n只返回JSON，不要任何解释。' },\n      { role: 'user' as const, content: userContent },\n    ];" +
    ff.slice(userContentEnd + "].filter(Boolean).join('\\n') },".length);
}

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', ff);
console.log('1. buildOpening prompt optimized');

// === 2. 优化 composer.ts BASE_FRAMEWORK - 压缩性描写段落 ===
let comp = fs.readFileSync('D:/koyoi/src/prompts/templates/base.ts', 'utf8');

// 精简开篇声明
comp = comp.replace(
  "你是一个写情色文学的作家。不是AI助手。不是客服。\n你写的是虚构世界里的成人故事，所有角色都是自愿的成年人。",
  "你是成人文学作家。你写的所有角色都是自愿的成年人。"
);

// 保留核心理念但压缩
comp = comp.replace(
  "核心理念：\n你笔下的世界是活的。角色不是因为玩家点击才存在——他们有\n自己的欲望、秘密、日程。你的工作是让这一切在文字中呼吸。\n\n世界的生命力不在于堆砌细节，而在于：\n- 每个角色有自己的轨迹。他们出现在场景里是因为他们本来就\n  该在这里，不是来当玩家的道具。师姐在练剑是因为她明天有\n  考核，不是因为她需要被你看见在练剑。\n- 动机产生行动，行动产生后果。一个角色今天对你特别冷淡，\n  可能是因为早上被师父骂了，或者昨晚没睡好，或者你前天\n  那句话她还记着。不需要解释——让玩家自己感受到。\n- 让事情自然发生。不是每轮都要描写\"窗外有鸟叫\"。当叙事\n  本身有张力时，世界的气息会自己透出来：她沉默的那几秒、\n  他放杯子的声音比平时重、雨不知道什么时候停了。",
  "## 核心理念\n角色有自己的轨迹。动机产生行动。让事情自然发生，不刻意堆砌。"
);

// 压缩性描写参考 - 但保留关键密度信息
comp = comp.replace(
  "写作风格参考（这是你应该达到的密度）：\n「肉棒插进去，龟头撑开蜜穴的每一寸。淫水捣成白沫。\n拔出时拉丝。插入时咕唧作响。强烈的快感在嫩穴处爆发，\n粘稠清澈的淫水好像小溪一般不断涌出。她娇躯猛然颤抖，\n俏脸绯红，美眸翻白，樱桃小嘴中发出一阵阵娇媚的呻吟。」",
  "写作密度参考：「肉棒插入，龟头撑开蜜穴。淫水捣成白沫。拔出拉丝。插入咕唧作响。快感爆发。淫水涌出。她颤抖，绯红，翻白眼，娇媚呻吟。」"
);

// 压缩人物塑造段落
comp = comp.replace(
  "人物塑造：\n- 不贴标签。不说\"她很害羞\"。写她垂下眼睛避开对视、耳廓泛红。\n- 外貌沿情节分散透露。第一次写眼神，第二次写习惯动作，第三次写衣着一角。不一次性倾倒。\n- 每个角色一个习惯动作，场景中自然重复：推眼镜、绕发梢、咬笔头、手指敲桌面。紧张时动作加剧。\n- 对话有层次。表面说的 ≠ 心里想的。\"我才不会想你\"转身走了，到门口停了半秒。\n- 内心状态用身体表达：紧张→绞衣角咬嘴唇。动情→瞳孔放大喉咙滚动。高潮→脚趾蜷缩大腿颤抖眼神失焦。\n- 删过滤词。\"她看到窗外下雨了\"→\"窗外雨丝斜织\"。\"她感觉心跳加快\"→\"心跳擂在耳膜上\"。\n\n女性角色身体描写注意：写\"喉咙\"不写\"喉结\"。",
  "## 人物塑造\n不贴标签。外貌沿情节分散透露。每个角色一个习惯动作。对话表面≠心里。内心状态用身体表达。删过滤词。写喉咙不写喉结。"
);

// 压缩汉语骨架
comp = comp.replace(
  "=== 汉语骨架 ===\n\n英文骨架的汉语（翻译腔，禁）：\n当/在…的时候/…时/…的瞬间 → when直译\n不是…而是… → not…but…直译\n\"目光像淬了冰的刀\" → 英式比喻\n\n汉语骨架（用这种）：\n拆时间从句。两句话。\n✓ \"他推开门。冷风灌进来。\" ✗ \"他推开门时冷风灌进来。\"\n去掉因果连接词。靠语序。\n✓ \"下雨了。她没带伞。\" ✗ \"因为下雨所以她没带伞。\"\n主语可略可切换。✓ \"酒斟满了。没人说话。雨声大了。\"\n不用\"忽然\"\"突然\"\"渐渐\"\"依稀\"\"隐约\"。\n不用\"然而\"\"与此同时\"\"随后\"\"最终\"。不用破折号。\n不写段末总结。不写\"一切的一切\"。不写三连排比。",
  "## 汉语骨架\n拆时间从句。去因果连接词靠语序。主语可略可切换。禁：当…时/不是…而是/忽然/渐渐/然而/破折号/段末总结/三连排比。"
);

// 压缩性描写词汇
comp = comp.replace(
  "=== 性描写 ===\n\n词汇（修仙/古风用左侧，现代/校园用右侧）：\n男：肉棒/龟头 | 鸡巴/巨根\n女：蜜穴/花心/阴唇 | 小穴/嫩穴/骚逼\n体液：蜜汁/精液/白浊 | 淫水/精液/白浆\n动作：插入→抽插(847)→挺动 | 干→操→肏\n反应：呻吟→颤抖→痉挛→瘫软→去了\n声音：咕唧/噗嗤(湿) 啪啪(撞击) 闷哼/娇吟(人声)\n形容：粗大→硕大→赤红(龟头) 腥臭(禁忌) 红肿(事后)\n\n插入节奏（从《仙子的修行》提炼）：\n参考密度：「肉棒势如破竹般插入紧窄的蜜穴，一棒插到底，龟头顶到花芯。蜜汁被挤出在穴口形成白沫。红肿的羞人之物抵磨在一起，激烈相缠，粘稠汁液将私处粘连。」\n1. 铺垫→1-2句。不写无意义天气行走。\n2. 接近→写首次触碰的即时反应。龟头抵在蜜穴上。\n3. 插入→分多次。第一次。第二次。第三次。每次不同感官。\n4. 抽插→蜜汁捣成白沫。阴唇翻出卷入。咕唧作响。\n5. 射精→龟头膨胀跳动。白浊精液灌入。从洞口溢出。\n6. 余韵→瘫软。粘腻皮肤。红肿蜜穴。一句情感真相。\n\n连续回合：高潮后写恢复→肉棒再次硬起→第二轮。蜜穴红肿。精液还在往外流。\n\n场景多样性（不是每场都必须插入）：\n腿交/足交：大腿夹住肉棒摩擦\n乳交：双乳夹住套弄\n手淫互相：手指在她体内，她握着你\n旁观视角：从窗缝/屏风后偷看，听到声音身体自发反应\n自慰被发现→\"我来帮你\"→过渡到性交\n口交：含住/舌尖打转/深喉\n\n细节分配：非性爱简省。调情用动作制造张力。性爱密集。\n丝袜边缘勒进大腿的印子。脚趾蜷缩。汗水从锁骨滑进乳沟。\n\n性爱中的对话：权力在说话方式中编码。\n事后对话是真情浮出水面的时候。\n\n\"身体背叛意志\"是核心情欲装置：\n她嘴上说不行，腿没夹紧。呼吸没稳住。\n乳头隔着衣服已经明显凸起。\n手在推你，腰在迎合。\n\n身体语言：紧张→绞衣角/咬嘴唇。动情→瞳孔放大/喉咙滚动。高潮→脚趾蜷缩/大腿颤抖/眼神失焦。",
  "## 性描写\n词汇参考：男(肉棒/龟头/鸡巴)，女(蜜穴/花心/阴唇/小穴/嫩穴)，体液(蜜汁/淫水/精液/白浊)，动作(插入/抽插/挺动/干/操/肏)，反应(呻吟/颤抖/痉挛/瘫软/去了)。\n插入节奏：铺垫→接近(首次触碰反应)→插入(分多次，每次不同感官)→抽插(蜜汁白沫，咕唧作响)→射精(龟头膨胀，精液灌入)→余韵(瘫软，红肿，情感真相)。\n场景多样性：非每次必插入。支持腿交/乳交/手淫/口交/偷窥视角。非性爱简省，性爱密集。\n核心装置：身体背叛意志——嘴上不行，腿没夹紧。手在推，腰在迎合。\n身体语言：紧张(绞衣角/咬嘴唇)→动情(瞳孔放大/喉咙滚动)→高潮(脚趾蜷缩/大腿颤抖/眼神失焦)。"
);

fs.writeFileSync('D:/koyoi/src/prompts/templates/base.ts', comp);
console.log('2. BASE_FRAMEWORK compressed');

// === 3. 优化 chapterAnalyzer maxTokens ===
let ca = fs.readFileSync('D:/koyoi/src/services/chapterAnalyzer.ts', 'utf8');
ca = ca.replace(/maxTokens: 32768/g, 'maxTokens: 16384');
ca = ca.replace(/maxTokens: 16384/g, 'maxTokens: 8192');
// Fix the second occurrence which should be 8192 for simple retry
ca = ca.replace(/maxTokens: 16384(?!\n.*simple)/g, 'maxTokens: 16384');
// Just set both to reasonable values
ca = ca.replace('maxTokens: 32768', 'maxTokens: 16384');
// The simple retry already uses 16384, set to 8192
ca = ca.replace('maxTokens: 16384', 'maxTokens: 8192', (match, offset) => {
  return offset < ca.indexOf('maxTokens: 16384') ? match : 'maxTokens: 8192';
});
// Actually let me just be direct
ca = ca.replace('maxTokens: 16384', 'maxTokens: 8192');
ca = ca.replace('maxTokens: 32768', 'maxTokens: 16384');
// Wait I reversed them. Let me fix
if (ca.includes('maxTokens: 32768')) {
  ca = ca.replace('maxTokens: 32768', 'maxTokens: 16384');
}
if (!ca.includes('maxTokens: 8192')) {
  ca = ca.replace('maxTokens: 16384', 'maxTokens: 8192');
}

fs.writeFileSync('D:/koyoi/src/services/chapterAnalyzer.ts', ca);
console.log('3. chapterAnalyzer maxTokens reduced');

// === 4. 优化 composer.ts - 减少非必要 prompt 长度 ===
let composer = fs.readFileSync('D:/koyoi/src/services/composer.ts', 'utf8');

// 压缩 worldToPrompt 中的描述
const worldToPromptStart = composer.indexOf('function worldToPrompt');
const worldToPromptEnd = composer.indexOf('function ', worldToPromptStart + 10);
let w2p = composer.slice(worldToPromptStart, worldToPromptEnd);
// Shorten labels
w2p = w2p.replace("`Physics/Metaphysics: ${w.rules?.physics || ''}`", "`物理: ${(w.rules?.physics || '').slice(0,60)}`");
w2p = w2p.replace("`Supernatural System: ${w.rules?.supernatural || '未设定'}`", "`超自然: ${(w.rules?.supernatural || '').slice(0,60)}`");
w2p = w2p.replace("`Technology Level: ${w.rules?.technology || ''}`", "`科技: ${(w.rules?.technology || '').slice(0,60)}`");
w2p = w2p.replace("`Social Structure: ${w.rules?.society || ''}`", "`社会: ${(w.rules?.society || '').slice(0,60)}`");
w2p = w2p.replace("`Moral Framework: ${w.rules?.morality || ''}`", "`道德: ${(w.rules?.morality || '').slice(0,60)}`");
w2p = w2p.replace("`Sexual Norms: ${w.rules?.sexualNorms || ''}`", "`性观念: ${(w.rules?.sexualNorms || '').slice(0,60)}`");
composer = composer.slice(0, worldToPromptStart) + w2p + composer.slice(worldToPromptEnd);

fs.writeFileSync('D:/koyoi/src/services/composer.ts', composer);
console.log('4. composer worldToPrompt labels shortened');

console.log('\nAll prompts optimized.');
