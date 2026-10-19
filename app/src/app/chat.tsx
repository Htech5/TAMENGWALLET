import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClarifyView, DecisionView, MandateDraftView } from '@/components/ChatCards';
import { Icon } from '@/components/Icon';
import { Tam } from '@/components/Tam';
import { Chip, CircleButton, T } from '@/components/ui';
import { api } from '@/lib/api';
import { chatStore, ChatItem, useChat } from '@/lib/chatStore';
import { useKeyboardOpen } from '@/lib/hooks';
import { Contact } from '@/lib/types';
import { c, f, r } from '@/theme';

const SUGGESTIONS = ['Send 10 USDC to Adik', 'Send 40 USDC to Ibu', 'Set up a monthly auto-send', 'What did you block?'];

export default function Chat() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ prefill?: string; auto?: string }>();
  const items = useChat();
  const [text, setText] = useState(params.prefill ?? '');
  const [busy, setBusy] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const scroll = useRef<ScrollView>(null);
  const autoSent = useRef(false);
  // Android edge-to-edge no longer resizes the window, so the composer is lifted by padding on both platforms.
  const kbOpen = useKeyboardOpen(() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50));

  useEffect(() => {
    api.getContacts().then((x) => setContacts(x.items)).catch(() => {});
  }, []);

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || busy) return;
    setText('');
    const id = `u-${Date.now()}`;
    chatStore.add({ id, from: 'me', text: message, at: Date.now() });
    setBusy(true);
    try {
      const res = await api.chat(message, id);
      chatStore.add({ id: res.messageId, from: 'tam', text: res.reply, card: res.card, at: Date.now() });
    } catch (e) {
      chatStore.update(id, { failed: true });
      chatStore.add({
        id: `err-${Date.now()}`,
        from: 'tam',
        text: e instanceof Error ? e.message : "I couldn't reach the server. Nothing was sent. Try again in a moment.",
        at: Date.now(),
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (params.auto === '1' && params.prefill && !autoSent.current) {
      autoSent.current = true;
      send(params.prefill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.auto, params.prefill]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="padding">
      <View style={[st.band, { paddingTop: insets.top + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <CircleButton icon="back" label="Back" bg={c.bg} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <View style={st.tamAv}>
            <Tam size={26} />
          </View>
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: f.medium, fontSize: 20 }}>Tam</T>
            <T v="small" style={{ color: c.ink2 }}>
              Checks every request first
            </T>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scroll}
        style={st.body}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {items.map((it) => (
          <Message key={it.id} item={it} contacts={contacts} onPick={send} />
        ))}
        {busy && (
          <View style={st.tamRow}>
            <View style={st.tamSmall}>
              <Tam size={18} />
            </View>
            <View style={[st.bubbleTam, { flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
              <ActivityIndicator size="small" color={c.ink} />
              <T v="small" style={{ color: c.ink2 }}>
                Checking your rules
              </T>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[st.composer, { paddingBottom: 10 + (kbOpen ? 0 : insets.bottom) }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
          {SUGGESTIONS.map((s) => (
            <Chip key={s} label={s} onPress={() => send(s)} />
          ))}
        </ScrollView>
        <View style={st.input}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Ask Tam to send, check, or explain"
            placeholderTextColor={c.silver}
            style={st.field}
            multiline
            onSubmitEditing={() => send(text)}
            blurOnSubmit
            returnKeyType="send"
            accessibilityLabel="Message to Tam"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            onPress={() => send(text)}
            disabled={!text.trim() || busy}
            style={[st.sendBtn, (!text.trim() || busy) && { opacity: 0.45 }]}
          >
            <Icon name="arrowUp" size={20} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Message({ item, contacts, onPick }: { item: ChatItem; contacts: Contact[]; onPick: (v: string) => void }) {
  if (item.from === 'me') {
    return (
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <View style={st.bubbleMe}>
          <T v="body" style={{ color: c.white }}>
            {item.text}
          </T>
        </View>
        {item.failed && (
          <T v="caption" style={{ color: c.pinkInk }}>
            Not delivered
          </T>
        )}
      </View>
    );
  }
  const card = item.card;
  const alert = card?.type === 'decision' && card.decision === 'deny';
  return (
    <View style={st.tamRow}>
      <View style={[st.tamSmall, alert && { backgroundColor: c.pinkTint }]}>
        <Tam size={18} mood={alert ? 'alert' : 'calm'} />
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        {!!item.text && (
          <View style={st.bubbleTam}>
            <T v="body">{item.text}</T>
          </View>
        )}
        {card?.type === 'decision' && <DecisionView item={item} card={card} />}
        {card?.type === 'clarify' && <ClarifyView card={card} onPick={onPick} />}
        {card?.type === 'mandate_draft' && <MandateDraftView item={item} card={card} contacts={contacts} />}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  band: { backgroundColor: c.band, paddingHorizontal: 20, paddingBottom: 40 },
  body: { flex: 1, backgroundColor: c.bg, borderTopLeftRadius: r.xxl, borderTopRightRadius: r.xxl, marginTop: -24 },
  tamAv: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.stabilo, alignItems: 'center', justifyContent: 'center' },
  tamRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  tamSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.stabilo, alignItems: 'center', justifyContent: 'center' },
  bubbleMe: { maxWidth: '82%', backgroundColor: c.ink, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18, borderBottomRightRadius: 4 },
  bubbleTam: { alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: c.soft, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18, borderBottomLeftRadius: 4 },
  composer: { borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg, paddingHorizontal: 16, paddingTop: 10, gap: 10 },
  input: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: c.soft, borderRadius: 26, paddingLeft: 18, paddingRight: 6, paddingVertical: 5, minHeight: 52 },
  field: { flex: 1, fontFamily: f.regular, fontSize: 15, color: c.ink, paddingVertical: 10, maxHeight: 120 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.stabilo, alignItems: 'center', justifyContent: 'center' },
});
