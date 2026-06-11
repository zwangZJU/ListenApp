import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';

import LibraryScreen from './LibraryScreen';
import ReviewScreen from './ReviewScreen';
import ProfileScreen from './ProfileScreen';

const TABS = [
  { key: 'learn', label: 'Learn', icon: 'library-outline', iconActive: 'library' },
  { key: 'review', label: 'Review', icon: 'checkmark-circle-outline', iconActive: 'checkmark-circle' },
  { key: 'profile', label: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

export default function TabNavigator({ navigation }) {
  const [activeTab, setActiveTab] = React.useState('learn');
  const { theme } = useTheme();

  const renderScreen = () => {
    switch (activeTab) {
      case 'learn':
        return <LibraryScreen navigation={navigation} />;
      case 'review':
        return <ReviewScreen navigation={navigation} />;
      case 'profile':
        return <ProfileScreen navigation={navigation} />;
      default:
        return <LibraryScreen navigation={navigation} />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.screenContainer}>
        {renderScreen()}
      </View>
      <SafeAreaView edges={['bottom']} style={[styles.tabBarSafe, { backgroundColor: theme.bg }]}>
        <View style={[styles.tabBar, { backgroundColor: theme.bg, borderTopColor: theme.tabBorder }]}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tab}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive ? tab.iconActive : tab.icon}
                  size={22}
                  color={isActive ? theme.text : theme.textDim}
                />
                <Text style={[styles.tabLabel, { color: isActive ? theme.text : theme.textDim }, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },
  tabBarSafe: {},
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: Platform.OS === 'ios' ? 0 : 8,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  tabLabelActive: {
    fontWeight: '700',
  },
});
