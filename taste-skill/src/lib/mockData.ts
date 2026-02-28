import type { Draft } from '@/types/story';

export const MOCK_DRAFT: Draft = {
  schema_version: '1.0.0',
  story_id: 'mock-story-001',
  generated_at: new Date().toISOString(),
  book_meta: {
    title: '小明和神奇的西兰花',
    subtitle: '一个关于勇气和尝试的故事',
    theme_food: '西兰花',
    story_type: 'adventure',
    target_behavior_level: 'Lv2',
    summary:
      '小明从来不敢吃西兰花，直到有一天他遇见了一棵会说话的小西兰花，带他踏上了一段奇妙的探险之旅……',
    design_logic:
      '通过拟人化西兰花角色，将"尝试新食物"的行为与冒险探索建立情感联结。每页互动环节帮助孩子建立对西兰花的正向记忆，循序渐进从"闻一闻"到"咬一口"，符合行为塑造 Lv1→Lv3 梯度。',
    global_visual_style: '温暖柔和的水彩风格，主色调为绿色和黄色，角色造型圆润可爱',
  },
  pages: [
    {
      page_no: 1,
      page_id: 'page-001',
      behavior_anchor: 'Lv1',
      text: '小明坐在餐桌前，面前的盘子里有一朵绿色的西兰花。"这是什么怪东西呀？"小明歪着头说，皱起了眉头。',
      image_prompt:
        '可爱的小男孩坐在餐桌前，面对一盘西兰花，表情好奇又有点嫌弃，温暖的厨房背景，水彩风格',
      interaction: { type: 'none', instruction: '', event_key: 'page1_view' },
      branch_choices: [],
    },
    {
      page_no: 2,
      page_id: 'page-002',
      behavior_anchor: 'Lv1',
      text: '突然，西兰花开口说话了！"你好呀，小明！我是布鲁克，西兰花王国的小骑士！先来闻闻我的味道嘛～"',
      image_prompt:
        '西兰花变成一个穿铠甲的小骑士，向小明挥手打招呼，两人面对面，充满奇幻色彩，水彩插画风格',
      interaction: {
        type: 'tap',
        instruction: '点击西兰花，闻一闻它的味道！',
        event_key: 'smell_broccoli',
      },
      branch_choices: [],
    },
    {
      page_no: 3,
      page_id: 'page-003',
      behavior_anchor: 'Lv2',
      text: '"布鲁克带我去哪里探险呢？"小明兴奋地问。布鲁克说："你来选！是去神秘的绿色森林，还是飞上云朵城堡？"',
      image_prompt:
        '左边是茂密的绿色森林，右边是云朵上的城堡，小明和西兰花骑士站在分岔路口，水彩梦幻风格',
      interaction: {
        type: 'choice',
        instruction: '帮小明选一条路！',
        event_key: 'choose_path',
      },
      branch_choices: [
        { choice_id: 'forest', label: '🌿 绿色森林', next_page_id: 'page-004' },
        { choice_id: 'castle', label: '☁️ 云朵城堡', next_page_id: 'page-004' },
      ],
    },
    {
      page_no: 4,
      page_id: 'page-004',
      behavior_anchor: 'Lv2',
      text: '布鲁克说："在西兰花王国里，要打败小怪兽，就要学我一样——张开嘴，做出咬的动作！"布鲁克夸张地演示了一遍。',
      image_prompt:
        '西兰花骑士做出夸张的张嘴咬合动作，旁边有一只圆滚滚的小怪兽，动作卡通夸张，充满趣味',
      interaction: {
        type: 'mimic',
        instruction: '跟着布鲁克一起做！张开嘴，做出咬的动作～',
        event_key: 'mimic_bite',
      },
      branch_choices: [],
    },
    {
      page_no: 5,
      page_id: 'page-005',
      behavior_anchor: 'Lv3',
      text: '"太棒了！"布鲁克欢呼道，"现在把能量豆子放进魔法碗，我们就能完成任务啦！"小明看了看盘子里的西兰花……',
      image_prompt:
        '一个发光的魔法碗，旁边有圆滚滚的西兰花"能量豆子"，小明的手正准备夹起一颗，充满奇幻光效',
      interaction: {
        type: 'drag',
        instruction: '把西兰花拖进魔法碗里！',
        event_key: 'drag_broccoli',
      },
      branch_choices: [],
    },
    {
      page_no: 6,
      page_id: 'page-006',
      behavior_anchor: 'Lv3',
      text: '"你做到啦！"布鲁克骄傲地说，"小明，你是世界上最勇敢的孩子！西兰花真的没那么可怕，对不对？"小明笑着点了点头。',
      image_prompt:
        '小明和西兰花骑士并肩站在彩虹下，小明脸上带着满足的微笑，温暖阳光洒下，庆祝胜利的氛围',
      interaction: { type: 'none', instruction: '', event_key: 'page6_view' },
      branch_choices: [],
    },
  ],
  ending: {
    positive_feedback:
      '小明今天太厉害了！不仅闻了西兰花、做了咬合动作，还自己把西兰花放进了碗里。你也能像小明一样勇敢哦！',
    next_micro_goal: '下次吃饭时，试着舔一舔西兰花，感受一下它的味道～',
  },
  telemetry_suggestions: {
    recommended_events: ['page_view', 'page_dwell', 'interaction', 'branch_select', 'story_complete'],
  },
};
