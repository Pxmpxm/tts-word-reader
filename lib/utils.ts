import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 延迟执行函数
 * @param ms 毫秒数
 * @returns Promise
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 截断文本，超出长度添加省略号
 * @param text 原始文本
 * @param maxLength 最大长度
 * @returns 截断后的文本
 */
export function truncateText(text: string, maxLength: number = 30): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * 保存设置到localStorage
 * @param key 键名
 * @param value 值
 */
export function saveToLocalStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error(`保存设置失败 (${key}):`, error);
  }
}

/**
 * 从localStorage读取设置
 * @param key 键名
 * @param defaultValue 默认值
 * @returns 读取的值或默认值
 */
export function loadFromLocalStorage(key: string, defaultValue: string): string {
  if (typeof window === 'undefined') return defaultValue;
  
  try {
    const value = localStorage.getItem(key);
    return value !== null ? value : defaultValue;
  } catch (error) {
    console.error(`读取设置失败 (${key}):`, error);
    return defaultValue;
  }
}

/**
 * 检查是否在客户端环境
 * @returns 是否在客户端
 */
export function isClient(): boolean {
  return typeof window !== 'undefined';
}
