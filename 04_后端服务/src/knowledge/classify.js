const experimentRules = [
    ["logic_gate", /逻辑门|与非门|或非门|异或门|74LS00|74LS04|74LS28|74LS86/gi],
    ["adder", /半加器|全加器|加法器|进位|74LS283/gi],
    ["decoder", /译码器|译码显示|74LS138|74LS48|数码管/gi],
    ["flip_flop", /触发器|D触发器|JK触发器|74LS74|74LS112/gi],
    ["counter", /计数器|74LS160|74LS161/gi],
    ["multiplexer", /数据选择器|74LS153|74LS151/gi]
];

export function classifyDocument(text) {
    const scores = experimentRules.map(([type, pattern]) => [type, (text.match(pattern) || []).length]);
    const experimentTypes = scores.filter(([, score]) => score >= 2).sort((a, b) => b[1] - a[1]).map(([type]) => type);
    const manualSignals = (text.match(/引脚|管脚|封装|电气特性|参数|芯片|器件/gi) || []).length;
    const courseSignals = (text.match(/实验目的|实验内容|实验步骤|实验报告|实验原理/gi) || []).length;
    return {
        primaryType: experimentTypes[0] || "general",
        experimentTypes: experimentTypes.length ? experimentTypes : ["general"],
        documentKind: courseSignals >= 3 ? "course_material" : (manualSignals >= 3 ? "chip_reference" : "course_material"),
        realHardware: /VCC|GND|引脚|管脚|实验箱|电源/gi.test(text),
        scores: Object.fromEntries(scores)
    };
}

export function classifyChunk(text, documentClassification) {
    const local = classifyDocument(text);
    let knowledgeType = "concept";
    if (/真值表|输入[\s\S]{0,80}输出|0\s+0\s+[01]/.test(text)) knowledgeType = "truth_table";
    else if (/引脚|管脚|封装|VCC|GND/.test(text)) knowledgeType = "pinout";
    else if (/实验步骤|操作步骤|实验过程|接线|连接/.test(text)) knowledgeType = "procedure";
    else if (/公式|表达式|Y\s*=|S\s*=|C\s*=|[¬∧∨⊕]/.test(text)) knowledgeType = "formula";
    else if (/注意|禁止|必须|不能|切断电源/.test(text)) knowledgeType = "safety";
    return {
        experimentType: local.primaryType === "general" ? documentClassification.primaryType : local.primaryType,
        knowledgeType
    };
}
