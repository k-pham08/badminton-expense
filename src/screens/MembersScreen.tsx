import { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Card, PrimaryButton, SecondaryButton, SectionTitle, TextField } from '../components/ui';
import { useStore } from '../store';
import { colors, radius, space } from '../theme';
import { parseZaloPeople } from '../utils/vote';

export function MembersScreen() {
  const store = useStore();
  const members = store.data.members;
  const zaloContacts = store.data.zaloContacts ?? [];
  const [name, setName] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pickZalo, setPickZalo] = useState<string | null>(null);

  const add = () => {
    const id = store.addMember(name);
    if (!id) return;
    setName('');
  };

  const remove = (id: string, memberName: string) => {
    Alert.alert('Xóa thành viên?', memberName, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => store.removeMember(id) },
    ]);
  };

  const readPaste = async () => {
    try {
      const html = (await Clipboard.getStringAsync()).trim();
      setPasteText(html);
      if (!html) {
        Alert.alert('Clipboard trống', 'Copy outerHTML danh sách thành viên nhóm Zalo trước.');
      }
    } catch {
      setPasteText('');
    }
  };

  const openPaste = async () => {
    setPasteOpen(true);
    await readPaste();
  };

  const importPaste = () => {
    const people = parseZaloPeople(pasteText);
    if (!people.length) {
      Alert.alert('Không thấy thành viên', 'Dán HTML danh sách thành viên nhóm Zalo (có avatar + tên).');
      return;
    }
    const count = store.importZaloPeople(people);
    setPasteOpen(false);
    setPasteText('');
    setPickZalo(null);
    Alert.alert('Đã nhập Zalo', `${count} người. Bấm người Zalo rồi bấm thành viên app để gắn.`);
  };

  const picked = zaloContacts.find((item) => item.id === pickZalo);

  const onPressZalo = (contactId: string) => {
    setPickZalo((current) => (current === contactId ? null : contactId));
  };

  const onPressMember = (memberId: string) => {
    if (!pickZalo) return;
    store.linkZaloContact(pickZalo, memberId);
    setPickZalo(null);
  };

  const linkedCount = zaloContacts.filter((item) => item.memberId).length;
  const pastePeople = pasteOpen ? parseZaloPeople(pasteText) : [];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.title}>Thành viên</Text>
      <Card>
        <SectionTitle>Zalo ↔ App</SectionTitle>
        <Text style={styles.hint}>
          Dán HTML danh sách thành viên nhóm Zalo (kèm avatar). Sau đó bấm một người bên Zalo, rồi bấm người bên app để gắn.
        </Text>
        <SecondaryButton label="Dán HTML thành viên Zalo" onPress={() => void openPaste()} />
        {picked ? (
          <Text style={styles.pickHint}>Đang chọn Zalo: {picked.name}. Bấm một người trong app để gắn.</Text>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>
          Zalo ({zaloContacts.length}){linkedCount ? ` · đã gắn ${linkedCount}` : ''}
        </SectionTitle>
        {zaloContacts.length === 0 ? (
          <Text style={styles.empty}>Chưa có list Zalo. Dán HTML thành viên nhóm ở trên.</Text>
        ) : (
          zaloContacts.map((contact) => {
            const linked = members.find((member) => member.id === contact.memberId);
            const selected = pickZalo === contact.id;
            return (
              <Pressable
                key={contact.id}
                onPress={() => onPressZalo(contact.id)}
                onLongPress={() => {
                  if (contact.memberId) store.unlinkZaloContact(contact.id);
                }}
                style={[styles.person, selected && styles.personOn]}
              >
                {contact.avatar ? (
                  <Image
                    source={{ uri: contact.avatar.replace(/&amp;/g, '&') }}
                    style={styles.avatar}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarEmpty]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.personName}>{contact.name}</Text>
                  <Text style={styles.meta}>{linked ? `→ ${linked.name}` : 'Chưa gắn'}</Text>
                </View>
                {linked ? (
                  <Pressable onPress={() => store.unlinkZaloContact(contact.id)}>
                    <Text style={styles.deleteText}>Gỡ</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => {
                      store.createMemberFromZalo(contact.id);
                      setPickZalo(null);
                    }}
                  >
                    <Text style={styles.link}>Tạo</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })
        )}
      </Card>

      <Card>
        <SectionTitle>Trong app ({members.length})</SectionTitle>
        <TextField
          label="Thêm tên trong app"
          value={name}
          onChangeText={setName}
          placeholder="Ví dụ: Khoa"
          onSubmitEditing={add}
        />
        <PrimaryButton label="Lưu thành viên" onPress={add} disabled={!name.trim()} />
        {members.length === 0 ? (
          <Text style={[styles.empty, { marginTop: 10 }]}>Chưa có thành viên app.</Text>
        ) : (
          members.map((member) => {
            const zalo = zaloContacts.find((item) => item.memberId === member.id);
            const waiting = Boolean(pickZalo);
            return (
              <View key={member.id} style={[styles.person, waiting && styles.personTarget]}>
                <Pressable
                  onPress={() => (waiting ? onPressMember(member.id) : undefined)}
                  style={styles.personMain}
                >
                  {member.zaloAvatar || zalo?.avatar ? (
                    <Image
                      source={{ uri: (member.zaloAvatar || zalo?.avatar || '').replace(/&amp;/g, '&') }}
                      style={styles.avatar}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarEmpty]} />
                  )}
                  <View style={{ flex: 1 }}>
                    {waiting ? (
                      <>
                        <Text style={styles.personName}>{member.name}</Text>
                        <Text style={styles.meta}>Bấm để gắn với {picked?.name}</Text>
                      </>
                    ) : (
                      <>
                        <MemberNameField
                          name={member.name}
                          onCommit={(text) => store.renameMember(member.id, text)}
                        />
                        <Text style={styles.meta}>{zalo ? `Zalo: ${zalo.name}` : 'Chưa gắn Zalo'}</Text>
                      </>
                    )}
                  </View>
                </Pressable>
                <Pressable onPress={() => remove(member.id, member.name)} style={styles.deleteBtn}>
                  <Text style={styles.deleteText}>Xóa</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </Card>

      <Modal visible={pasteOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Dán HTML Zalo</Text>
            <Pressable onPress={() => setPasteOpen(false)}>
              <Text style={styles.link}>Đóng</Text>
            </Pressable>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.hint}>
              Zalo Desktop: cuộn hết list thành viên nhóm, copy outerHTML `.ReactVirtualized__Grid__innerScrollContainer`. Không cần sửa HTML.
            </Text>
            <SecondaryButton label="Dán từ clipboard" onPress={() => void readPaste()} />
            <Text style={pastePeople.length ? styles.pickHint : styles.hint}>
              {pasteText
                ? pastePeople.length
                  ? `Đã dán · ${pastePeople.length} người`
                  : 'Không thấy thành viên trong HTML.'
                : 'Chưa dán list.'}
            </Text>
          </View>
          {pastePeople.length > 0 ? (
            <View style={styles.modalFooter}>
              <PrimaryButton label="Nhập list Zalo" onPress={importPaste} />
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
}

function MemberNameField({ name, onCommit }: { name: string; onCommit: (text: string) => void }) {
  const [text, setText] = useState(name);
  const commit = () => {
    const next = text.trim();
    if (!next || next === name) {
      setText(name);
      return;
    }
    onCommit(next);
  };
  return (
    <TextField value={text} onChangeText={setText} onSubmitEditing={commit} onBlur={commit} />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.md,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: space.md,
  },
  hint: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  pickHint: {
    marginTop: 10,
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  empty: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  personMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  personOn: {
    backgroundColor: colors.primarySoft,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  personTarget: {
    backgroundColor: '#FAFAFA',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.line,
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarEmpty: {
    backgroundColor: colors.line,
  },
  personName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  link: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  deleteText: {
    color: colors.danger,
    fontWeight: '700',
  },
  modalSafe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  modalBody: {
    flex: 1,
    padding: space.md,
  },
  modalFooter: {
    paddingHorizontal: space.md,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
  },
});
