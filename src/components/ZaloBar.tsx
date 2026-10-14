import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space } from '../theme';
import {
  ZaloBridgeError,
  fetchZaloGroups,
  loadZaloConfig,
  normalizeHost,
  saveZaloConnection,
  saveZaloGroup,
  type ZaloGroup,
} from '../utils/zaloBridge';
import { loadZalo, useZaloSyncState, zaloStatusLine } from '../utils/zaloSync';
import { PrimaryButton, SecondaryButton, TextField } from './ui';

export function ZaloBar() {
  const sync = useZaloSyncState();
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState('');
  const [token, setToken] = useState('');
  const [groups, setGroups] = useState<ZaloGroup[] | null>(null);
  const [busy, setBusy] = useState(false);

  const openSheet = async () => {
    const config = await loadZaloConfig();
    setHost(config?.host ?? '');
    setToken(config?.token ?? '');
    setGroups(null);
    setOpen(true);
  };

  const connect = async () => {
    const nextHost = normalizeHost(host);
    const nextToken = token.trim();
    if (!nextHost || !nextToken) {
      Alert.alert('Thiếu host hoặc token', 'Token in trong terminal lúc chạy npm run zalo.');
      return;
    }
    setBusy(true);
    try {
      await saveZaloConnection(nextHost, nextToken);
      const list = await fetchZaloGroups(nextHost, nextToken);
      if (!list.length) {
        Alert.alert('Không thấy nhóm', 'Tài khoản Zalo chưa có nhóm nào.');
        setGroups([]);
        return;
      }
      if (list.length === 1) {
        await saveZaloGroup(list[0].id, list[0].name);
        setOpen(false);
        void loadZalo(true);
        return;
      }
      setGroups(list);
    } catch (error) {
      const message = error instanceof ZaloBridgeError ? error.message : 'Không tới được Mac';
      Alert.alert('Chưa kết nối', message);
    } finally {
      setBusy(false);
    }
  };

  const pickGroup = async (group: ZaloGroup) => {
    await saveZaloGroup(group.id, group.name);
    setOpen(false);
    void loadZalo(true);
  };

  const refresh = () => {
    void loadZalo(true);
  };

  return (
    <View style={styles.wrap}>
      <Text style={sync.phase === 'ok' || sync.phase === 'idle' || sync.phase === 'updating' ? styles.status : styles.warn}>
        {zaloStatusLine(sync)}
      </Text>
      {sync.phase === 'unconfigured' ? (
        <SecondaryButton label="Kết nối Zalo" onPress={() => void openSheet()} />
      ) : (
        <View style={styles.row}>
          <View style={styles.grow}>
            <SecondaryButton label="Tải phiếu ghim" onPress={refresh} />
          </View>
          <Pressable onPress={() => void openSheet()} style={styles.change}>
            <Text style={styles.changeText}>Đổi nhóm</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{groups ? 'Chọn nhóm' : 'Kết nối Zalo'}</Text>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={styles.changeText}>Đóng</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {groups === null ? (
              <>
                <Text style={styles.hint}>
                  Trên Mac chạy npm run zalo, quét QR, rồi dán host và token. Ví dụ http://192.168.1.10:3927. Ra khỏi nhà thì dùng IP Tailscale.
                </Text>
                <TextField
                  label="Host"
                  value={host}
                  onChangeText={setHost}
                  placeholder="http://192.168.1.10:3927"
                  autoCapitalize="none"
                />
                <TextField
                  label="Token"
                  value={token}
                  onChangeText={setToken}
                  placeholder="Token trong terminal"
                  autoCapitalize="none"
                />
                <PrimaryButton label={busy ? 'Đang kết nối' : 'Lưu và lấy nhóm'} onPress={() => void connect()} disabled={busy} />
              </>
            ) : (
              groups.map((group) => (
                <Pressable key={group.id} onPress={() => void pickGroup(group)} style={styles.group}>
                  <Text style={styles.groupName}>{group.name}</Text>
                  <Text style={styles.hint}>{group.totalMember} người</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  status: {
    color: colors.muted,
    fontSize: 14,
  },
  warn: {
    color: colors.warning,
    fontSize: 14,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  grow: {
    flex: 1,
  },
  change: {
    paddingVertical: 8,
  },
  changeText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  body: {
    padding: space.md,
    gap: 8,
  },
  hint: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  group: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
});
