import { describe, it, expect } from 'vitest';
import { formatCodeForDisplay } from './codeFormatter';

describe('formatCodeForDisplay', () => {
  it('HTML 标签名与属性之间的空格必须保留', () => {
    const input = '<html lang="zh-CN">\n<meta charset="UTF-8">\n<form class="todo-form">\n<input type="text">\n<button type="submit">';
    const output = formatCodeForDisplay(input, 'html');
    expect(output).toContain('<html lang="zh-CN">');
    expect(output).toContain('<meta charset="UTF-8">');
    expect(output).toContain('<form class="todo-form">');
    expect(output).toContain('<input type="text">');
    expect(output).toContain('<button type="submit">');
    expect(output).not.toContain('<htmllang=');
    expect(output).not.toContain('<metacharset=');
    expect(output).not.toContain('<formclass=');
  });

  it('单行压缩 HTML 格式化后属性空格不丢失', () => {
    const input = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>t</title></head><body><form id="todoForm" class="todo-form"><input id="todoInput" type="text"><button type="submit">添加</button></form></body></html>';
    const output = formatCodeForDisplay(input, 'html');
    expect(output).toContain('<html lang="zh-CN">');
    expect(output).toContain('<meta charset="UTF-8">');
    expect(output).toContain('<form id="todoForm" class="todo-form">');
    expect(output).toContain('<input id="todoInput" type="text">');
    expect(output).toContain('<button type="submit">');
  });

  it('无空格的压缩标签会被补上空格（<metacharset= -> <meta charset=）', () => {
    const output = formatCodeForDisplay('<metacharset="UTF-8">', 'html');
    expect(output).toContain('<meta charset="UTF-8">');
  });

  it('JS 格式化后字符串字面量内的分号不受影响', () => {
    const input = 'const s = "a;b";';
    const output = formatCodeForDisplay(input, 'js');
    expect(output).toContain('"a;b"');
  });

  it('CSS 格式化后属性值内的内容不受影响', () => {
    const input = 'body::after { content: "a;b"; }';
    const output = formatCodeForDisplay(input, 'css');
    expect(output).toContain('"a;b"');
  });

  it('多行代码（>4 行）不做格式化，原样返回', () => {
    const input = 'a\nb\nc\nd\ne';
    expect(formatCodeForDisplay(input, 'html')).toBe(input);
  });

  it('未知语言不做格式化', () => {
    const input = 'some text { } ;';
    expect(formatCodeForDisplay(input, 'unknown')).toBe(input);
  });
});
