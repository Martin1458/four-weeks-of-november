# for file in ./imgs/*.png; do print $file

import pathlib

img_dir = pathlib.Path('./imgs')
for img_path in img_dir.glob('*.png'):
    print(img_path)
    
selected_img_num = input("Select the number: ")
selected_img_path = pathlib.Path('./imgs') / (selected_img_num + '.png')

import cv2

