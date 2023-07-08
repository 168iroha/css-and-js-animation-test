/** @type { HTMLElement[] } 円のリスト */
const circleList = [...document.querySelectorAll('.circle')].filter(e => e instanceof HTMLElement);

/**
 * HTML要素からAnimationEffectを生成する
 * @param { HTMLElement } circle 円を示す要素
 * @param { number } idx circleについてのインデックス
 */
const createCircleKeyframeEffect = (circle, idx) => {
	// 雑に半径100pxの円軌道をさせる
	const len = '100px';
	circle.style.top = `-${len}`;
	circle.style.transformOrigin = `center ${len}`;
	return new CSSEffect(circle, ['animation']);
};

// 偶数番目の円についてのアニメーション
const animationEven = circleList.map((circle, idx) => {
	if (idx % 2 === 0) {
		const fadeAnimation = new CSSEffect(circle, ['negative'], false);
		return (new AnimationTree)
			.next(fadeAnimation)
			.next(createCircleKeyframeEffect(circle, idx))
			.next(() => fadeAnimation.toggle())
			.next(fadeAnimation)
			.next(() => fadeAnimation.toggle());
	}
});
// 奇数番目の円についてのアニメーション
const animationOdd = circleList.map((circle, idx) => {
	if (idx % 2 === 1) {
		const fadeAnimation = new CSSEffect(circle, ['negative'], false);
		return (new AnimationTree)
			.next(fadeAnimation)
			.next(createCircleKeyframeEffect(circle, idx))
			.next(() => fadeAnimation.toggle())
			.next(fadeAnimation)
			.next(() => fadeAnimation.toggle());
	}
});

// アニメーションの定義
const handle = (new AnimationTree)
.label('first')
.next(animationEven)
.next(animationOdd)
// firstというラベルへジャンプする動作を10回繰り返す
.goto('first', i => i < 10);

// アニメーションの実行
handle.play();

// ボタンクリックで再生制御
document.getElementById('start').onclick = () => handle.play();
document.getElementById('pause').onclick = () => handle.pause();
document.getElementById('end').onclick = () => handle.finish();
