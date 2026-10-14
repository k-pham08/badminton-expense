import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, PrimaryButton, SectionTitle, TextField } from '../components/ui';
import { useStore } from '../store';
import { colors, radius, space } from '../theme';

export function MembersScreen() {
  const store = useStore();
  const members = store.data.members;
  const [name, setName] = useState('');

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

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.title}>Thành viên</Text>
      <Card>
        <SectionTitle>Trong app ({members.length})</SectionTitle>
        <TextField
          label="Thêm tên"
          value={name}
          onChangeText={setName}
          placeholder="Ví dụ: Khoa"
          onSubmitEditing={add}
        />
        <PrimaryButton label="Lưu thành viên" onPress={add} disabled={!name.trim()} />
        {members.length === 0 ? (
          <Text style={styles.empty}>Chưa có thành viên.</Text>
        ) : (
          members.map((member) => (
            <View key={member.id} style={styles.person}>
              <View style={{ flex: 1 }}>
                <MemberNameField name={member.name} onCommit={(text) => store.renameMember(member.id, text)} />
              </View>
              <Pressable onPress={() => remove(member.id, member.name)} style={styles.deleteBtn}>
                <Text style={styles.deleteText}>Xóa</Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>
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
  return <TextField value={text} onChangeText={setText} onSubmitEditing={commit} onBlur={commit} />;
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
  empty: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
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
});
