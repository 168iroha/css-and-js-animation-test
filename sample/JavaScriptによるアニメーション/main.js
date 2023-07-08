/** @type { HTMLElement[] } 円のリスト */
const circleList = [...document.querySelectorAll('.circle')].filter(e => e instanceof HTMLElement);

/**
 * HTML要素からAnimationEffectを生成する
 * @param { HTMLElement } circle 円を示す要素
 * @param { number } idx circleについてのインデックス
 */
const createCircleKeyframeEffect = (circle, idx) => {
	circle.classList.remove('negative');
	// 雑に半径100pxの円軌道をさせる
	const len = '100px';
	circle.style.top = `-${len}`;
	circle.style.transformOrigin = `center ${len}`;
	return new KeyframeEffect(
		circle,
		[
			// 適当に初期の回転角をずらす
			{ offset: 0, rotate: `${idx * 10}deg` },
			{ offset: 1, rotate: `${360 + idx * 10}deg` }
		],
		{
			fill: 'both',
			duration: 1000,
			iterations: 1
		}
	);
};

// アニメーションの定義
const handle = (new AnimationTree)
.label('first')
.next(
	// 偶数番目の円についてのアニメーション
	circleList.map((circle, idx) => {
		if (idx % 2 === 0) {
			return createCircleKeyframeEffect(circle, idx);
		}
	})
).next(
	// 奇数番目の円についてのアニメーション
	circleList.map((circle, idx) => {
		if (idx % 2 === 1) {
			return createCircleKeyframeEffect(circle, idx);
		}
	})
)
// firstというラベルへジャンプする動作を10回繰り返す
.goto('first', i => i < 10);

// アニメーションの実行
handle.play();

// ボタンクリックで再生制御
document.getElementById('start').onclick = () => handle.play();
document.getElementById('pause').onclick = () => handle.pause();
document.getElementById('end').onclick = () => handle.finish();
