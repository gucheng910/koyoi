import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface Props { visible: boolean; onAgree: () => void; onExit: () => void; }

export default function DisclaimerScreen({ visible, onAgree, onExit }: Props) {
  const { mode } = useTheme();
  const isDark = mode === 'dark';
  const s = styles(isDark);

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.title}>免责声明</Text>
          <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
            <Text style={s.section}>一、AI 生成内容</Text>
            <Text style={s.text}>
              本应用使用 DeepSeek 等第三方大语言模型（LLM）生成文字内容。所有 AI 生成的对话、场景、剧情均为模型根据用户输入自动创作，不代表本应用开发者的观点或立场。
              用户应知悉 AI 生成内容可能存在不准确、不适当或不符合预期的情况。本应用不对 AI 生成内容的准确性、完整性、合法性作任何明示或默示的保证。
            </Text>

            <Text style={s.section}>二、同人创作与版权</Text>
            <Text style={s.text}>
              本应用的同人穿越功能旨在为小说创作者和文学爱好者提供创作灵感与辅助工具。用户上传的小说文件仅用于本地分析和角色扮演辅助，不会上传至任何远程服务器。
              用户应确保拥有所上传内容的合法权利，或上传行为符合合理使用（Fair Use）原则。严禁将无版权的他人作品上传用于分析或商业用途。
              如用户上传未经授权的版权作品，由此产生的一切版权纠纷、法律责任和经济损失均由用户自行承担，与本应用及其开发者无关。
            </Text>

            <Text style={s.section}>三、隐私与数据安全</Text>
            <Text style={s.text}>
              本应用为完全本地化应用。所有用户数据——包括但不限于对话记录、角色设定、小说文件、偏好设置——均存储在用户设备本地，不会上传至任何服务器或第三方平台。
              本应用仅在调用 AI 接口（DeepSeek API）时将必要的对话上下文发送至 API 服务器以获取回复，此过程不包含用户的个人身份信息。API 调用遵循 DeepSeek 隐私政策。本应用不收集、不存储、不分享用户的任何个人信息。
            </Text>

            <Text style={s.section}>四、使用限制</Text>
            <Text style={s.text}>
              用户须自行承担使用本应用的风险。在使用过程中应遵守所在国家或地区的法律法规。严禁利用本应用生成违法、暴力、仇恨、色情或其他不当内容。本应用保留限制或终止不当使用的权利。
            </Text>

            <Text style={s.section}>五、免责与责任限制</Text>
            <Text style={s.text}>
              本应用按"现状"提供，不作任何形式的明示或默示保证。在适用法律允许的最大范围内，本应用开发者不对因使用或无法使用本应用而产生的任何直接、间接、附带、特殊或后果性损害承担责任。
            </Text>
          </ScrollView>
          <View style={s.buttons}>
            <TouchableOpacity style={s.btnAgree} onPress={onAgree}>
              <Text style={s.btnAgreeText}>我已阅读并同意</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnExit} onPress={onExit}>
              <Text style={s.btnExitText}>退出</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function styles(dark: boolean) {
  const c = dark
    ? { bg: '#1A1814', border: '#2A2822', text: '#E8DCC8', muted: '#8A8070', accent: '#5B9BD5' }
    : { bg: '#FFFFFF', border: '#E8E4DD', text: '#2D2822', muted: '#8A8070', accent: '#4A8AC4' };
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    card: { backgroundColor: c.bg, borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, height: '70%', borderWidth: 1, borderColor: c.border },
    title: { fontSize: 20, fontWeight: '700', color: c.text, textAlign: 'center', marginBottom: 20 },
    scroll: { flex: 1, marginBottom: 16 },
    section: { fontSize: 14, fontWeight: '700', color: c.accent, marginTop: 16, marginBottom: 4 },
    text: { fontSize: 13, color: c.muted, lineHeight: 22, marginBottom: 8 },
    buttons: { flexDirection: 'row', gap: 12 },
    btnAgree: { flex: 1, backgroundColor: c.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    btnAgreeText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
    btnExit: { flex: 1, backgroundColor: dark ? '#2A2822' : '#E8E4DD', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    btnExitText: { color: dark ? '#8A8070' : '#8A8070', fontSize: 15, fontWeight: '600' },
  });
}
