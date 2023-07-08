/**
 * CSSによるエフェクト
 */
class CSSEffect {
	/** @type { HTMLElement } CSSを適用する要素 */
	#element;
	/** @type { string[] } 適用するCSSクラスのリスト */
	#classList;
	/** @type { boolean } trueならクラスをつける、falseならクラスを取り外す */
	#attachType;
	/** @type { boolean } 初回実行とみなせるか */
	#firstTime = true;
	/** @type { string[] } 対象となるアニメーション名のリスト */
	#animationList = [];
	/** @type { string[] } トランジション対象のプロパティ名のリスト */
	#transitionList = [];
	/** @type { Promise<AnimationTree>? } 現在実行中のアニメーションのPromise  */
	#currentPromise = null;
	/** @type { AnimationPlayState } アニメーションの状態 */
	#playState = 'idle';

	/**
	 * CSSによるエフェクトの定義
	 * @param { HTMLElement } element CSSを適用する要素
	 * @param { string[] } classList 適用するCSSクラスのリスト
	 * @param { boolean } attachType trueならクラスをつける、falseならクラスを取り外す
	 */
	constructor(element, classList, attachType = true) {
		this.#element = element;
		this.#classList = classList;
		this.#attachType = attachType;
	}

	/**
	 * アニメーションの実行状態の取得
	 */
	get playState() {
		return this.#playState;
	}

	/**
	 * アニメーションの終了に関するPromiseを取得する
	 */
	get finished() {
		return this.#currentPromise ?? Promise.reject(this);
	}

	/**
	 * アニメーションを反転させる
	 */
	toggle() {
		this.#attachType = !this.#attachType;
		this.#firstTime = true;
	}

	/**
	 * アニメーションを実行する(Promise生成部)
	 */
	#exec() {
		let state = false;
		let resolveEffect = v => { state = true; };

		/** @type { boolean } トランジション開始イベントが実行されたか */
		let transitionStartEventFlag = false;
		/**
		 * @param { TransitionEvent } e  
		 */
		const pushTransitionEvent = e => {
			transitionStartEventFlag = true;
			if (!this.#transitionList.includes(e.propertyName)) {
				this.#transitionList.push(e.propertyName);
			}
		};
		/**
		 * @param { AnimationEvent } e  
		 */
		const animationEndEvent = e => {
			this.#animationList = this.#animationList.filter(x => x !== e.animationName);
			if (this.#animationList.length === 0) {
				// 全てのアニメーションイベントが完了したらそれを通知する
				this.#element.removeEventListener('animationend', animationEndEvent);
				// finishで終了した場合はPromise解決するためにトランジションも削除する
				if (this.#playState === 'finished') {
					this.#transitionList = [];
				}
				if (this.#transitionList.length === 0) {
					resolveEffect(this);
				}
			}
		};
		/**
		 * @param { TransitionEvent } e  
		 */
		const transitionEndEvent = e => {
			this.#transitionList = this.#transitionList.filter(x => x !== e.propertyName);
			if (this.#transitionList.length === 0) {
				// 全てのトランジションイベントが完了したらそれを通知する
				this.#element.removeEventListener('transitionend', transitionEndEvent);
				if (this.#animationList.length === 0) {
					resolveEffect(this);
				}
			}
		};
		const deleteTransitionStartEvent = () => {
			this.#element.removeEventListener('transitionstart', pushTransitionEvent);
			this.#element.removeEventListener('transitionrun', pushTransitionEvent);
			if (this.#transitionList.length === 0 && this.#animationList.length === 0) {
				resolveEffect(this);
			}
		};
		const createPromise = () => {
			this.#firstTime = false;
			// トランジション対象の捕捉のためのイベントを設置
			this.#element.addEventListener('transitionstart', pushTransitionEvent);
			this.#element.addEventListener('transitionrun', pushTransitionEvent);

			// アニメーション対象の取得
			const prevStyle = getComputedStyle(this.#element);
			const prevAnimationList =  prevStyle.animationName.split(',').map(x => x.trim());
			if (this.#attachType) {
				this.#element.classList.add(...this.#classList);
			}
			else {
				this.#element.classList.remove(...this.#classList);
			}
			const nextAnimationList =  getComputedStyle(this.#element).animationName.split(',').map(x => x.trim());
			this.#animationList = nextAnimationList.filter(x => prevAnimationList.indexOf(x) === -1);

			if (prevStyle.transitionDuration !== '0s') {
				// 何かしらトランジションが存在する可能性がある場合は捕捉を行う
				let cnt = 0;
				const f = () => {
					// 適当に最大2フレームだけトランジションを捕捉するようにする
					if (++cnt < 2 && !transitionStartEventFlag) {
						requestAnimationFrame(f);
					}
					else {
						transitionStartEventFlag = true;
					}
		
					// イベントの破棄
					if (transitionStartEventFlag) {
						deleteTransitionStartEvent();
					}
				};
				requestAnimationFrame(f);
			}
			else {
				deleteTransitionStartEvent();
			}

			// CSSアニメーションが存在すればplayする
			if (this.#animationList.length !== 0) {
				this.#element.style.animationPlayState = this.#playState;
			}
		};

		this.#element.addEventListener('animationend', animationEndEvent);
		this.#element.addEventListener('transitionend', transitionEndEvent);
		
		// CSSクラスをアタッチしてアニメーションの対象を捕捉する
		if (!this.#firstTime) {
			// アニメーションが再実行されるようにCSSクラスの再設定を行う
			// 数フレーム分だけ画面がチラつく可能性があるのは妥協
			// 参考：https://developer.mozilla.org/ja/docs/Web/CSS/CSS_Animations/Tips#Run_an_animation_again
			if (this.#attachType) {
				this.#element.classList.remove(...this.#classList);
			}
			else {
				this.#element.classList.add(...this.#classList);
			}
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					createPromise();
				});
			});
		}
		else {
			createPromise();
		}

		return new Promise((resolve, reject) => {
			resolveEffect = resolve;
			if (state) {
				// Promiseのresolve設定時点で解決していた場合は即解決とする
				resolve(this);
			}
		}).then(x => {
			// 初期化
			this.#currentPromise = null;
			this.#playState = 'finished';
			this.#element.style.animationPlayState = this.#playState;
			return x;
		});
	}

	/**
	 * アニメーションを中断する
	 */
	pause() {
		if (this.#playState === 'running') {
			this.#playState = 'paused';
			// CSSアニメーションが存在すればpauseする
			if (this.#animationList.length !== 0) {
				this.#element.style.animationPlayState = this.#playState;
			}
		}
	}

	/**
	 * アニメーションを実行する
	 */
	play() {
		const prevState = this.#playState;
		this.#playState = 'running';
		this.#element.style.animationDuration = '';
		if (prevState === 'idle' || prevState === 'finished') {
			this.#currentPromise = this.#exec();
		}
		// CSSアニメーションが存在すればplayする
		if (this.#animationList.length !== 0) {
			this.#element.style.animationPlayState = this.#playState;
		}
	}

	/**
	 * アニメーションを終了状態にする
	 */
	finish() {
		this.#playState = 'finished';
		// Animation APIとは異なりplay-stateにfinishが存在しないため以下で代替
		this.#element.style.animationDuration = '0s';
		this.#element.style.animationPlayState = 'running';
	}
}

/**
 * @typedef { AnimationTree | AnimationEffect | CSSEffect | undefined } AnimationElementEffect エフェクトの内アニメーション要素となるもの
 */

/**
 * アニメーションについてのツリー
 */
class AnimationTree {
	/** @type { (AnimationElementEffect | AnimationElementEffect[] | Function)[] } アニメーションのためのエフェクトリスト */
	#effectList = [];
	/** @type { (Animation | AnimationTree)[] } 現在実行中のアニメーション  */
	#currentAnimationList = [];
	/** @type { number } 現在実行中のアニメーションのインデックス  */
	#currentAnimationIndex = 0;
	/** @type { Promise<AnimationTree>? } 現在実行中のアニメーションのPromise  */
	#currentPromise = null;
	/** @type { AnimationPlayState } アニメーションの状態 */
	#playState = 'idle';
	/** @type { Record<string, { to: number; entry: number }> } ラベルのマップ */
	#labelMap = {};

	/**
	 * アニメーションの実行状態の取得
	 */
	get playState() {
		return this.#playState;
	}

	/**
	 * アニメーションの終了に関するPromiseを取得する
	 */
	get finished() {
		return this.#currentPromise ?? Promise.reject(this);
	}

	/**
	 * 次に実行するアニメーションの構築
	 * @param { AnimationElementEffect | AnimationElementEffect[] | Function } effect 次に実行されるアニメーション
	 * @returns { AnimationTree }
	 */
	next(effect) {
		this.#effectList.push(effect);
		if (effect instanceof AnimationEffect) {
			// 今後の拡張のために実行時間などをここから計算してもいいかもしれない
			effect.getTiming();
		}
		return this;
	}

	/**
	 * アニメーションを実行する(Promise生成部)
	 */
	async #exec() {
		// 既に実行中の場合はreject
		if (this.#currentAnimationList.length > 0 || this.#currentAnimationIndex !== 0 || this.#currentPromise !== null) {
			throw new Error('アニメーション実施中のものに対して実施を行うことはできません');
		}

		const pushAnimation = e => {
			if (e instanceof AnimationTree || e instanceof CSSEffect) {
				this.#currentAnimationList.push(e);
			}
			if (e instanceof AnimationEffect) {
				this.#currentAnimationList.push(new Animation(e));
			}
		};

		for (; this.#currentAnimationIndex < this.#effectList.length; ++this.#currentAnimationIndex) {
			this.#currentAnimationList = [];
			const animation = this.#effectList[this.#currentAnimationIndex];
			if (Array.isArray(animation)) {
				// 並列に実行されるアニメーションを積む
				animation.forEach(e => pushAnimation(e));
			}
			else if (animation instanceof Function) {
				// 関数要素を実行する
				animation();
			}
			else {
				// 逐次に実行されるアニメーションを積む
				pushAnimation(animation);
			}
			this.#currentAnimationList.forEach(e => e.play());
			const promise = Promise.all(this.#currentAnimationList.map(e => e.finished));
			if (this.#playState === 'finished') {
				// 終了状態の場合は即終了させる
				this.#currentAnimationList.forEach(e => e.finish());
			}
            else if (this.#playState === 'paused') {
                // 中断中の場合は中断する(CSSトランジションは中断不可のため追加)
                this.#currentAnimationList.forEach(e => e.pause());
            }
			// 全てのアニメーションが終了するまで待機
			await promise;
		}

		// 初期化
		this.#currentAnimationList = [];
		this.#currentAnimationIndex = 0;
		this.#currentPromise = null;
		this.#playState = 'finished';
		for (const key in this.#labelMap) {
			this.#labelMap[key].entry = 0;
		}

		return this;
	}

	/**
	 * アニメーションを中断する
	 */
	pause() {
		if (this.#playState === 'running') {
			this.#playState = 'paused';
			this.#currentAnimationList.forEach(e => e.pause());
		}
	}

	/**
	 * アニメーションを実行する
	 */
	play() {
		const prevState = this.#playState;
		this.#playState = 'running';
		if (prevState === 'idle' || prevState === 'finished') {
			this.#currentPromise = this.#exec();
		}
		this.#currentAnimationList.forEach(e => e.play());
	}

	/**
	 * アニメーションを終了状態にする
	 */
	finish() {
		this.#playState = 'finished';
		this.#currentAnimationList.forEach(e => e.finish());
	}

	/**
	 * ラベルの設置
	 * @param { string } l ラベル
	 */
	label(l) {
		this.#labelMap[l] = { to: this.#effectList.length, entry: 0 };
		return this;
	}

	/**
	 * ジャンプの実施
	 * @param { string } l ジャンプ先のラベル
	 * @param { (i: number, l: string) => bool } c ジャンプの要否を示す関数
	 */
	goto(l, c) {
		this.#effectList.push(() => {
			if (!(l in this.#labelMap)) {
				throw new Error(`${l}というラベルは存在しません`);
			}
			++this.#labelMap[l].entry;
			if (c(this.#labelMap[l].entry, l)) {
				this.#currentAnimationIndex = this.#labelMap[l].to - 1;
			}
		});
		return this;
	}
}